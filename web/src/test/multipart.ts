/*
 * `multipart/form-data` for tests. jsdom's `FormData` and `File` (what the app builds in a test) are
 * not the ones Node's `fetch` and its body parser know: Node would send such a body as text, and
 * `request.formData()` fails on the files. `network.ts` sends a `FormData` body encoded here, as a
 * browser would, and handlers read it back with `readMultipart`.
 */

/** A part of a form: a text field, or a file with its name, declared type and bytes. */
export type FormPart = string | { name: string; type: string; bytes: Uint8Array };

/** The `FormData` encoded as a browser sends it, with the `Content-Type` that names the boundary. */
export async function encodeMultipart(
  form: FormData,
): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string }> {
  const boundary = `----family-app-test-${String(Math.random()).slice(2)}`;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      parts.push(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      );
    } else {
      parts.push(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; ` +
            `filename="${encodeURIComponent(value.name)}"\r\n` +
            `Content-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`,
        ),
        new Uint8Array(await value.arrayBuffer()),
        encoder.encode('\r\n'),
      );
    }
  }
  parts.push(encoder.encode(`--${boundary}--\r\n`));
  return { body: concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** The parts of a body `encodeMultipart` made, by name. */
export async function readMultipart(request: Request): Promise<Map<string, FormPart>> {
  const boundary = /boundary=(.+)$/.exec(request.headers.get('Content-Type') ?? '')?.[1];
  if (boundary === undefined) throw new Error('readMultipart: not a multipart/form-data request');
  const body = new Uint8Array(await request.arrayBuffer());
  // Latin-1 keeps one character per byte, so offsets in the text are offsets in the bytes.
  const text = new TextDecoder('latin1').decode(body);
  const parts = new Map<string, FormPart>();
  const delimiter = `--${boundary}`;
  let start = text.indexOf(delimiter) + delimiter.length + 2;
  for (;;) {
    const end = text.indexOf(`\r\n${delimiter}`, start);
    if (end < 0) break;
    const headersEnd = text.indexOf('\r\n\r\n', start);
    const headers = utf8(body.subarray(start, headersEnd));
    const content = body.subarray(headersEnd + 4, end);
    const name = /name="([^"]*)"/.exec(headers)?.[1] ?? '';
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    if (filename === undefined) {
      parts.set(name, utf8(content));
    } else {
      const type = /Content-Type: (.+)/.exec(headers)?.[1] ?? '';
      parts.set(name, { name: decodeURIComponent(filename), type, bytes: content.slice() });
    }
    start = end + 2 + delimiter.length + 2;
  }
  return parts;
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const all = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  parts.reduce((offset, part) => {
    all.set(part, offset);
    return offset + part.length;
  }, 0);
  return all;
}
