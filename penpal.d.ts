declare module 'penpal' {
  export type FunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends Function ? K : never;
  }[keyof T];

  export type AsyncMethodReturns<T, K extends keyof T = FunctionPropertyNames<T>> = {
    [KK in K]: T[KK] extends (...args: any[]) => PromiseLike<any>
      ? T[KK]
      : T[KK] extends (...args: infer A) => infer R
        ? (...args: A) => Promise<R>
        : T[KK];
  };

  export type CallSender = {
    [index: string]: Function;
  };

  type Connection<TCallSender extends object = CallSender> = {
    /**
     * A promise which will be resolved once a connection has been established.
     */
    promise: Promise<AsyncMethodReturns<TCallSender>>;
    /**
     * A method that, when called, will disconnect any messaging channels.
     * You may call this even before a connection has been established.
     */
    destroy: Function;
  };

  export type Methods = {
    [index: string]: Function;
  };

  type Options = {
    /**
     * Valid parent origin used to restrict communication.
     */
    parentOrigin?: string | RegExp;
    /**
     * Methods that may be called by the parent window.
     */
    methods?: Methods;
    /**
     * The amount of time, in milliseconds, Penpal should wait
     * for the parent to respond before rejecting the connection promise.
     */
    timeout?: number;
    /**
     * Whether log messages should be emitted to the console.
     */
    debug?: boolean;
  };

  export function connectToParent<TCallSender extends object = CallSender>(
    options: Options
  ): Connection<TCallSender>;
}
