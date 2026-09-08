import { registerDecorator, ValidationOptions } from "class-validator";

// Applies to an @IsDateString() field - keeps the value as a plain ISO
// string (the service parses it later) while still rejecting obviously
// invalid dates like a birth date in the future.
export function IsNotFutureDateString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isNotFutureDateString",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== "string") return true; // let @IsDateString report the type error
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return true;
          return date.getTime() <= Date.now();
        },
        defaultMessage() {
          return `${propertyName} cannot be in the future`;
        },
      },
    });
  };
}
