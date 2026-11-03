/** @format */

/**
 * Minimal Salsa20/20 stream cipher (256-bit key, 64-bit nonce), as used by GT7 telemetry.
 * `node:crypto` ships ChaCha20 but not Salsa20, and this is ~60 lines, so no dependency.
 */

const rotl = (value: number, shift: number): number => (value << shift) | (value >>> (32 - shift));

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // "expand 32-byte k"

const salsa20Block = (input: Uint32Array, output: Uint8Array): void => {
	const x = Uint32Array.from(input);
	for (let i = 0; i < 10; i += 1) {
		x[4] ^= rotl((x[0] + x[12]) | 0, 7);
		x[8] ^= rotl((x[4] + x[0]) | 0, 9);
		x[12] ^= rotl((x[8] + x[4]) | 0, 13);
		x[0] ^= rotl((x[12] + x[8]) | 0, 18);
		x[9] ^= rotl((x[5] + x[1]) | 0, 7);
		x[13] ^= rotl((x[9] + x[5]) | 0, 9);
		x[1] ^= rotl((x[13] + x[9]) | 0, 13);
		x[5] ^= rotl((x[1] + x[13]) | 0, 18);
		x[14] ^= rotl((x[10] + x[6]) | 0, 7);
		x[2] ^= rotl((x[14] + x[10]) | 0, 9);
		x[6] ^= rotl((x[2] + x[14]) | 0, 13);
		x[10] ^= rotl((x[6] + x[2]) | 0, 18);
		x[3] ^= rotl((x[15] + x[11]) | 0, 7);
		x[7] ^= rotl((x[3] + x[15]) | 0, 9);
		x[11] ^= rotl((x[7] + x[3]) | 0, 13);
		x[15] ^= rotl((x[11] + x[7]) | 0, 18);
		x[1] ^= rotl((x[0] + x[3]) | 0, 7);
		x[2] ^= rotl((x[1] + x[0]) | 0, 9);
		x[3] ^= rotl((x[2] + x[1]) | 0, 13);
		x[0] ^= rotl((x[3] + x[2]) | 0, 18);
		x[6] ^= rotl((x[5] + x[4]) | 0, 7);
		x[7] ^= rotl((x[6] + x[5]) | 0, 9);
		x[4] ^= rotl((x[7] + x[6]) | 0, 13);
		x[5] ^= rotl((x[4] + x[7]) | 0, 18);
		x[11] ^= rotl((x[10] + x[9]) | 0, 7);
		x[8] ^= rotl((x[11] + x[10]) | 0, 9);
		x[9] ^= rotl((x[8] + x[11]) | 0, 13);
		x[10] ^= rotl((x[9] + x[8]) | 0, 18);
		x[12] ^= rotl((x[15] + x[14]) | 0, 7);
		x[13] ^= rotl((x[12] + x[15]) | 0, 9);
		x[14] ^= rotl((x[13] + x[12]) | 0, 13);
		x[15] ^= rotl((x[14] + x[13]) | 0, 18);
	}
	const view = new DataView(output.buffer, output.byteOffset, 64);
	for (let i = 0; i < 16; i += 1) view.setUint32(i * 4, (x[i] + input[i]) >>> 0, true);
};

/** XORs `data` with the Salsa20 keystream; encryption and decryption are the same operation. */
export const salsa20Xor = (key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array => {
	if (key.length !== 32) throw new Error('Salsa20 key must be 32 bytes');
	if (nonce.length !== 8) throw new Error('Salsa20 nonce must be 8 bytes');

	const k = new DataView(key.buffer, key.byteOffset, 32);
	const n = new DataView(nonce.buffer, nonce.byteOffset, 8);
	const state = new Uint32Array(16);
	state[0] = SIGMA[0];
	state[5] = SIGMA[1];
	state[10] = SIGMA[2];
	state[15] = SIGMA[3];
	for (let i = 0; i < 4; i += 1) {
		state[1 + i] = k.getUint32(i * 4, true);
		state[11 + i] = k.getUint32(16 + i * 4, true);
	}
	state[6] = n.getUint32(0, true);
	state[7] = n.getUint32(4, true);

	const out = new Uint8Array(data.length);
	const block = new Uint8Array(64);
	let counter = 0;
	for (let offset = 0; offset < data.length; offset += 64) {
		state[8] = counter >>> 0;
		state[9] = Math.floor(counter / 0x100000000) >>> 0;
		salsa20Block(state, block);
		const end = Math.min(64, data.length - offset);
		for (let i = 0; i < end; i += 1) out[offset + i] = data[offset + i] ^ block[i];
		counter += 1;
	}
	return out;
};
