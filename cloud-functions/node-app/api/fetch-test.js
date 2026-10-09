/**
 * Cloud Function fetch test
 * Route: GET /node-app/api/fetch-test
 *
 * Calls a public URL so pages-cloud-functions-egress-bandwidth can be verified:
 *   unrestricted → ok:true + remote status
 *   restricted   → ok:false, restricted:true, code OUTBOUND_RESTRICTED
 *
 * Node fetch (undici) wraps socket errors as TypeError "fetch failed".
 * The net-hook error lives on error.cause (code OUTBOUND_RESTRICTED).
 */
const TARGET = "https://example.com/";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function serializeError(err, depth = 0) {
  if (!err || depth > 3) return undefined;
  if (typeof err !== "object") return { message: String(err) };
  return {
    name: err.name,
    message: err.message,
    code: err.code,
    host: err.host,
    port: err.port,
    cause: err.cause ? serializeError(err.cause, depth + 1) : undefined,
  };
}

function isRestricted(err) {
  let cur = err;
  for (let i = 0; i < 5 && cur; i++) {
    const code = cur.code || "";
    const message = cur.message || "";
    if (
      code === "OUTBOUND_RESTRICTED" ||
      /OUTBOUND_RESTRICTED/i.test(message) ||
      /PagesLimit:\s*egress quota/i.test(message)
    ) {
      return true;
    }
    cur = cur.cause;
  }
  return false;
}

export default async function onRequest(context) {
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const res = await fetch(TARGET, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
    });
    const text = await res.text();
    return json({
      ok: true,
      restricted: false,
      target: TARGET,
      remoteStatus: res.status,
      remoteContentType: res.headers.get("content-type"),
      bodyPreview: text.slice(0, 200),
      elapsedMs: Date.now() - started,
      requestId: context.uuid,
    });
  } catch (err) {
    const restricted = isRestricted(err);
    return json(
      {
        ok: false,
        restricted,
        target: TARGET,
        error: err?.message || String(err),
        code: err?.code || err?.cause?.code,
        cause: serializeError(err),
        elapsedMs: Date.now() - started,
        requestId: context.uuid,
      },
      restricted ? 403 : 502,
    );
  } finally {
    clearTimeout(timer);
  }
}
