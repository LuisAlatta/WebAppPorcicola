const worker = {
  async fetch(_request: Request): Promise<Response> {
    return Response.json({ error: 'Ruta no encontrada' }, { status: 404 });
  },
};

export default worker;
