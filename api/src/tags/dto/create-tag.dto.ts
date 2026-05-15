import { IsString, Length, Matches } from "class-validator"

/**
 * Payload accepted by `POST /streams/:id/tags`.
 *
 * The raw `name` is the human-friendly label; the server is responsible
 * for slugifying it and de-duplicating against existing tags.
 */
export class CreateTagDto {
  @IsString()
  @Length(1, 64, {
    message: "name must be between 1 and 64 characters",
  })
  @Matches(/[A-Za-z0-9]/, {
    message: "name must contain at least one alphanumeric character",
  })
  name!: string
}
