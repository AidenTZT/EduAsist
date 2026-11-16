/**
 * Reglas de negocio y validaciones estrictas
 */

// Regex para prohibir estrictamente caracteres numéricos en nombres y apellidos
// Solo permite letras castellanas/latinas con acentos, diéresis, espacios, apóstrofes y guiones
export const NAME_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/;

export function validateNoNumbersInName(value: string, fieldName: string): { valid: boolean; error?: string } {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return { valid: false, error: `El campo ${fieldName} es obligatorio.` };
  }

  const trimmed = value.trim();

  // Validación estricta: prohibir dígitos numéricos
  if (/\d/.test(trimmed)) {
    return {
      valid: false,
      error: `El campo ${fieldName} contiene números. Está estrictamente prohibido usar caracteres numéricos en nombres o apellidos.`,
    };
  }

  // Validación de caracteres válidos
  if (!NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `El campo ${fieldName} contiene símbolos no permitidos. Solo se admiten letras, espacios y guiones.`,
    };
  }

  if (trimmed.length < 2) {
    return {
      valid: false,
      error: `El campo ${fieldName} debe tener al menos 2 caracteres.`,
    };
  }

  return { valid: true };
}

export function assertNoNumbersInName(value: string, fieldName: string): void {
  const result = validateNoNumbersInName(value, fieldName);
  if (!result.valid) {
    throw new Error(result.error);
  }
}

export function isValidCedula(cedula: string): boolean {
  if (!cedula || typeof cedula !== 'string') return false;
  const digits = cedula.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 9;
}
