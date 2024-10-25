export abstract class Destroyable {
  protected constructor(
    public readonly uuid: string,
    cleanup: () => void
  ) {
    Destroyable.cache.set(uuid, cleanup)
    registry.register(this, uuid)
  }

  private static cache = new Map<string, () => void>()

  static destroy(uuid: string) {
    const cleanup = Destroyable.cache.get(uuid)
    if (cleanup) {
      Destroyable.cache.delete(uuid)
      cleanup()
    }
  }

  destroy() {
    Destroyable.destroy(this.uuid)
  }
}

const registry = new FinalizationRegistry((uuid: string) => {
  Destroyable.destroy(uuid)
})
