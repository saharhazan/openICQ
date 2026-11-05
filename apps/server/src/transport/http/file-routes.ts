/**
 * Files over HTTP (plan rule 12): `POST /api/files?purpose=attachment|avatar`
 * with one multipart field `file`, and `GET /api/files/:id` for signed-in users.
 */
import { API_PATHS, filePurposeSchema, idSchema, type UploadResult } from '@openicq/protocol';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../application/auth-service.ts';
import { INLINE_MIME_TYPES, type FileService } from '../../application/file-service.ts';
import type { OriginPolicy } from '../origin-policy.ts';
import type { SlidingWindowRateLimiter } from '../rate-limiter.ts';
import { NOT_SIGNED_IN_MESSAGE, originGuard, sessionOf } from './auth-routes.ts';
import { sendError } from './errors.ts';

export const UPLOAD_RATE_LIMITED = 'Too many uploads. Please wait a minute and try again.';
const FILE_FIELD = 'file';

export interface FileRoutesDeps {
  readonly auth: AuthService;
  readonly files: FileService;
  readonly origins: OriginPolicy;
  readonly uploadLimiter: SlidingWindowRateLimiter;
  readonly maxFileBytes: number;
}

/** `attachment` or `inline` with an ASCII fallback name and the exact UTF-8 name (RFC 6266). */
export function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function registerFileRoutes(app: FastifyInstance, deps: FileRoutesDeps): void {
  app.post<{ Querystring: { purpose?: unknown } }>(API_PATHS.files, { onRequest: [originGuard(deps.origins)] }, async (request, reply) => {
    const session = sessionOf(deps.auth, request);
    if (session === null) return sendError(reply, 'unauthorized', NOT_SIGNED_IN_MESSAGE);
    const purpose = filePurposeSchema.safeParse(request.query.purpose);
    if (!purpose.success) return sendError(reply, 'bad_request', 'purpose must be "attachment" or "avatar".');
    const decision = deps.uploadLimiter.attempt(String(session.uin));
    if (!decision.allowed) {
      reply.header('retry-after', String(Math.ceil(decision.retryAfterMs / 1000)));
      return sendError(reply, 'rate_limited', UPLOAD_RATE_LIMITED);
    }
    if (!request.isMultipart()) return sendError(reply, 'bad_request', 'Send the file as multipart/form-data.');
    // One byte over the limit reaches the storage, which then refuses the upload as too large.
    const part = await request.file({ limits: { fileSize: deps.maxFileBytes + 1, files: 1 } });
    if (part === undefined) return sendError(reply, 'bad_request', `Attach one file in the field "${FILE_FIELD}".`);
    if (part.fieldname !== FILE_FIELD) {
      part.file.resume();
      return sendError(reply, 'bad_request', `Attach one file in the field "${FILE_FIELD}".`);
    }
    const file = await deps.files.upload(session.uin, {
      source: part.file,
      fileName: part.filename,
      declaredMime: part.mimetype,
      purpose: purpose.data,
    });
    request.log.info({ uin: session.uin, fileId: file.fileId, size: file.size, kind: file.kind }, 'file uploaded');
    const result: UploadResult = { file };
    return reply.code(201).send(result);
  });

  app.get<{ Params: { id: string } }>(`${API_PATHS.files}/:id`, async (request, reply) => {
    const session = sessionOf(deps.auth, request);
    if (session === null) return sendError(reply, 'unauthorized', NOT_SIGNED_IN_MESSAGE);
    const id = idSchema.safeParse(Number(request.params.id));
    if (!id.success) return sendError(reply, 'not_found', 'File not found.');
    const download = await deps.files.download(session.uin, id.data);
    const inline = download.file.kind === 'image' && INLINE_MIME_TYPES.has(download.file.mime);
    return reply
      .header('content-type', download.file.mime)
      .header('content-length', String(download.size))
      .header('content-disposition', contentDisposition(inline ? 'inline' : 'attachment', download.file.name))
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', 'sandbox')
      .header('cache-control', 'private, no-cache')
      .send(download.open());
  });
}
