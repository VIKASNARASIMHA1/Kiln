/**
 * Yields complete text lines from a fetch response body, however the network splits the chunks
 * (a JSON line can arrive in two pieces). Handles \r\n and a final line without a newline.
 */
export async function* readLines(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, '');
      buffer = buffer.slice(i + 1);
      if (line.trim()) yield line;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.replace(/\r$/, '');
}
