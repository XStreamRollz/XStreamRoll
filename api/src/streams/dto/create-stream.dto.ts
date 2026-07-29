import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator"

/**
 * Payload accepted by `POST /streams`.
 */
export class CreateStreamDto {
  @IsString()
  @Length(1, 255, {
    message: "name must be between 1 and 255 characters",
  })
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000, {
    message: "description must be at most 2000 characters",
  })
  description?: string

  /**
   * Visibility on the discovery surface (issue #393). Defaults to
   * `"private"` when omitted — the conservative choice so creating a
   * stream never accidentally exposes it before the owner chooses
   * otherwise.
   */
  @IsOptional()
  @IsString()
  @IsIn(["public", "private"], {
    message: "visibility must be one of: public, private",
  })
  visibility?: "public" | "private"
}
