const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MASK = 63;

export function nanoid(size = 21): string {
  let id = '';
  while (id.length < size) {
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    for (let i = 0; i < bytes.length && id.length < size; i++) {
      const index = bytes[i]! & MASK;
      if (index < ALPHABET.length) {
        id += ALPHABET[index];
      }
    }
  }
  return id;
}
