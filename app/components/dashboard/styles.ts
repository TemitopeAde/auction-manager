/**
 * Class names for ./dashboard.css. The stylesheet is loaded with a <link> via the
 * route's `links` export (not as a CSS module) so it survives React re-rendering the
 * document; every class there is prefixed with `am-` to avoid collisions.
 */
const styles = new Proxy({} as Record<string, string>, {
  get: (_target, name) => `am-${String(name)}`,
});

export default styles;
