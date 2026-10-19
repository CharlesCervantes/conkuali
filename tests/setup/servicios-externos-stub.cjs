// Servicios externos SIMULADOS para las pruebas de integración (ver
// tests/setup/integracion.mjs): OpenAI y almacenamiento S3/R2. Importarlos
// no falla, pero cualquier intento de USARLOS lanza un error inmediato — así
// una prueba nunca llega a la red ni gasta créditos, aunque algún flujo los
// invoque por accidente.

class ServicioExternoDeshabilitado extends Error {
  constructor(nombre) {
    super(`Servicio externo deshabilitado en pruebas de integración: ${nombre}.`);
  }
}

const fallar = (nombre) => () => {
  throw new ServicioExternoDeshabilitado(nombre);
};

class OpenAI {
  constructor() {
    this.responses = { parse: fallar("OpenAI"), create: fallar("OpenAI") };
    this.chat = { completions: { create: fallar("OpenAI") } };
  }
}

class S3Client {
  send() {
    return Promise.reject(new ServicioExternoDeshabilitado("almacenamiento S3/R2"));
  }
}
class Comando {
  constructor(input) {
    this.input = input;
  }
}

module.exports = {
  __esModule: true,
  default: OpenAI,
  OpenAI,
  zodTextFormat: fallar("OpenAI (zodTextFormat)"),
  S3Client,
  PutObjectCommand: class extends Comando {},
  GetObjectCommand: class extends Comando {},
  DeleteObjectCommand: class extends Comando {},
  HeadObjectCommand: class extends Comando {},
  getSignedUrl: () => Promise.reject(new ServicioExternoDeshabilitado("URL firmada S3/R2")),
  ServicioExternoDeshabilitado,
};
