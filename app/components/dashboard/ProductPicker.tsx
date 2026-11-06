import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { loader as productSearchLoader, ProductPickerItem } from "../../routes/app.products";
import styles from "./styles";

export function ProductPicker() {
  const fetcher = useFetcher<typeof productSearchLoader>();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductPickerItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductPickerItem | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const queryRef = useRef(query);

  const loadPage = (search: string, cursor?: string | null) => {
    const params = new URLSearchParams({ q: search });
    if (cursor) params.set("after", cursor);
    fetcher.load(`/app/products?${params.toString()}`);
  };

  useEffect(() => {
    const normalizedQuery = query.trim().slice(0, 100);
    queryRef.current = normalizedQuery;
    setProducts([]);
    setNextCursor(null);
    setHasNextPage(false);
    const timeout = window.setTimeout(() => loadPage(normalizedQuery), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const result = fetcher.data;
    if (!result || result.query !== queryRef.current) return;
    setProducts((current) => result.after
      ? [...current, ...result.products.filter((product) => !current.some((item) => item.id === product.id))]
      : result.products);
    setHasNextPage(result.hasNextPage);
    setNextCursor(result.nextCursor);
  }, [fetcher.data]);

  const error = fetcher.data?.query === queryRef.current ? fetcher.data.error : null;
  const loading = fetcher.state !== "idle";

  return (
    <div className={styles.productPicker}>
      <label className={styles.field} htmlFor="auction-product-search">
        <span className={styles.fieldLabel}>Search active products</span>
        <input
          id="auction-product-search"
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search by product title"
          autoComplete="off"
        />
      </label>
      <input type="hidden" name="productId" value={selectedProduct?.id ?? ""} />

      {selectedProduct && (
        <div className={styles.productSelected}>
          <span><strong>Selected:</strong> {selectedProduct.title}</span>
          <button type="button" className={styles.productClear} onClick={() => setSelectedProduct(null)}>Clear</button>
        </div>
      )}

      {products.length > 0 && (
        <ul className={styles.productResults} aria-label="Eligible products">
          {products.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className={`${styles.productOption} ${selectedProduct?.id === product.id ? styles.productOptionSelected : ""}`}
                aria-pressed={selectedProduct?.id === product.id}
                onClick={() => setSelectedProduct(product)}
              >
                {product.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading && <span className={styles.subdued} role="status">Loading products…</span>}
      {!loading && error && <span className={styles.errorText} role="alert">{error}</span>}
      {!loading && !error && products.length === 0 && (
        <span className={styles.subdued} role="status">
          {hasNextPage ? "No eligible products in this batch. Load more to continue." : query ? "No eligible products match this search." : "No active products without an existing auction were found."}
        </span>
      )}
      {hasNextPage && (
        <button type="button" className={styles.productMore} disabled={loading} onClick={() => loadPage(queryRef.current, nextCursor)}>
          {loading ? "Loading…" : "Load more products"}
        </button>
      )}
    </div>
  );
}
