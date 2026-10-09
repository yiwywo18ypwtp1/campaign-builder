/**
 * Error text under a field. The field points to it with `aria-describedby={id}` and sets
 * `aria-invalid`, so screen readers announce the message together with the field.
 *
 * The line is always rendered (empty when there is no error): an error that disappears on
 * blur must not shift the layout, or a click on "Next" that caused the blur would land on
 * the wrong spot and get lost.
 */
export function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} className="min-h-5 text-sm text-destructive">
      {message}
    </p>
  );
}
