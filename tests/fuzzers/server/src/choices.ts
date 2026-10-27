/**
 * The choice surface a spec draws from.
 *
 * A spec's body fields and path parameters are filled against a seeded PRNG; under a
 * coverage-guided fuzzer the same choices have to come from the input bytes, so a mutation
 * is what changes them. This is the one interface both sides agree on — the product code
 * never sees it.
 */
export interface Choices {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(values: readonly T[]): T;
  chance(p: number): boolean;
}

/**
 * Bytes as choices: every call consumes the next byte (wrapping at the end, so a short input
 * still reaches every decision), and values combine two bytes where a fraction is wanted.
 */
export class ByteChoices implements Choices {
  private cursor = 0;

  constructor(private readonly bytes: Buffer) {}

  private byte(): number {
    if (this.bytes.length === 0) return 0;
    const value = this.bytes[this.cursor % this.bytes.length]!;
    this.cursor += 1;
    return value;
  }

  next(): number {
    return (this.byte() * 256 + this.byte()) / 65536;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[Math.floor(this.next() * values.length)] as T;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}
