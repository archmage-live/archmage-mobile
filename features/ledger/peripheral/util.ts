import { Slip10RawIndex, pathToString } from '@cosmjs/crypto'

export function readHdPath(data: Buffer): [number, string] {
  const pathLen = data.readUInt8()
  const path: Slip10RawIndex[] = []
  for (let i = 0; i < pathLen; i++) {
    path.push(new Slip10RawIndex(data.readUInt32BE(1 + 4 * i)))
  }
  return [1 + 4 * pathLen, pathToString(path)]
}

export class RequestTimer {
  private counter = 0
  private lastBeatAt = 0
  private readonly timerHandler: ReturnType<typeof setInterval>

  constructor(interval = 300) {
    this.timerHandler = setInterval(() => {
      if (Date.now() - this.lastBeatAt > interval) {
        ++this.counter
      }
    }, interval)
  }

  dispose() {
    clearInterval(this.timerHandler)
  }

  increment() {
    return ++this.counter
  }

  value() {
    return this.counter
  }

  beat() {
    this.lastBeatAt = Date.now()
  }
}

export class RequestChecker {
  constructor(private readonly timer: RequestTimer) {}

  check(restart = false) {
    if (this.id === -1) {
      this.id = this.timer.value()
      this.timer.beat()
    } else if (this.id !== this.timer.value()) {
      this.clean(false)
      if (restart) {
        this.check()
      } else {
        throw new Error('Request timeout')
      }
    } else {
      this.timer.beat()
    }
  }

  clean(increment = true) {
    this.id = -1
    if (increment) {
      this.timer.increment()
    }
  }

  private id: number = -1
}
