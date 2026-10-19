// Stub de lucide-react solo para pruebas (ver tests/setup/unitarias.mjs):
// cualquier ícono importado es un componente vacío.
module.exports = new Proxy({}, { get: () => () => null });
