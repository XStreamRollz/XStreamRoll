declare module "cookie-parser" {
  import { RequestHandler } from "express"

  function cookieParser(
    secrets?: string | string[],
    options?: object,
  ): RequestHandler
  namespace cookieParser {
    export { cookieParser as default }
  }
  export = cookieParser
}
