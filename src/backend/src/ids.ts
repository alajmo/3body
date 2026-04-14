export class EntityIdSequence {
  #nextEntityId = 1;

  nextEntityId(): number {
    const entityId = this.#nextEntityId;
    this.#nextEntityId += 1;
    return entityId;
  }
}

const randomBase36 = (length: number): string => {
  let value = "";

  while (value.length < length) {
    value += crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36);
  }

  return value.slice(0, length);
};

export const newPlayerId = (): string => crypto.randomUUID();

export const newRoomId = (): string => randomBase36(6);

export const newOpaqueToken = (): string => crypto.randomUUID();
