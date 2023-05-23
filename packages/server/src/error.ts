export class RPCError<const TCode extends string = string> extends Error {
  public readonly error: TCode;
  public readonly status?: number;
  constructor(opts: {
    code: TCode;
    status?: number;
    message?: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.error = opts.code;
    this.status = opts.status;
    this.name = this.constructor.name;
  }
}