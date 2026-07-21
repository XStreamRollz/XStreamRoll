declare module "class-validator" {
  export type ValidationOptions = Record<string, unknown>

  export function IsEmail(options?: ValidationOptions): PropertyDecorator
  export function IsString(options?: ValidationOptions): PropertyDecorator
  export function IsOptional(options?: ValidationOptions): PropertyDecorator
  export function Length(
    min: number,
    max?: number,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function Min(
    min: number,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function Max(
    max: number,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function IsInt(options?: ValidationOptions): PropertyDecorator
  export function Matches(
    pattern: RegExp,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function IsIn(
    values: unknown[],
    options?: ValidationOptions,
  ): PropertyDecorator
  export function MaxLength(
    max: number,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function IsISO8601(
    options?: { strict?: boolean } & ValidationOptions,
  ): PropertyDecorator
  export function MinLength(
    min: number,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function IsNotEmpty(options?: ValidationOptions): PropertyDecorator
  export function IsArray(options?: ValidationOptions): PropertyDecorator
  export function IsUrl(
    urlOptions?: Record<string, unknown>,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function ArrayMinSize(
    min: number,
    options?: ValidationOptions,
  ): PropertyDecorator
  export function ArrayUnique(options?: ValidationOptions): PropertyDecorator

  export type ValidationArguments = {
    value: unknown
    constraints: unknown[]
    targetName: string
    object: Record<string, unknown>
    property: string
  }

  export function validate(
    object: unknown,
    options?: ValidationOptions,
  ): Promise<{ property: string; constraints: Record<string, string> }[]>

  export function validateOrReject(
    object: unknown,
    options?: ValidationOptions,
  ): Promise<void>
}

declare module "class-transformer" {
  export function Type(
    returnType: () => new (...args: unknown[]) => unknown,
  ): PropertyDecorator
}
