import express from 'express';

// Express 4 tidak menangkap error dari handler async.
// Router ini membungkus setiap handler agar error diteruskan ke error handler.
export function Router() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const orig = router[method].bind(router);
    router[method] = (path, ...handlers) =>
      orig(
        path,
        ...handlers.map((h) => (req, res, next) => {
          try {
            const out = h(req, res, next);
            if (out && typeof out.catch === 'function') out.catch(next);
          } catch (e) {
            next(e);
          }
        })
      );
  }
  return router;
}
