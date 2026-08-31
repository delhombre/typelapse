/**
 * Node 24 publishes an experimental `localStorage` global, but without a
 * `--localstorage-file` it resolves to undefined. In some Vitest workers that
 * shadows jsdom's implementation before a test starts. Keep the browser-like
 * contract deterministic without writing test state to disk.
 */
if (window.localStorage === undefined) {
	const buckets = new WeakMap<object, Map<string, string>>();
	const storage = Object.create(Storage.prototype) as Storage;
	buckets.set(storage, new Map());

	const itemsFor = (target: object): Map<string, string> => {
		const items = buckets.get(target);
		if (!items) {
			throw new TypeError("Storage method called on an incompatible receiver");
		}
		return items;
	};

	Object.defineProperties(Storage.prototype, {
		length: {
			configurable: true,
			get(this: Storage) {
				return itemsFor(this).size;
			},
		},
		clear: {
			configurable: true,
			value(this: Storage) {
				itemsFor(this).clear();
			},
			writable: true,
		},
		getItem: {
			configurable: true,
			value(this: Storage, key: string) {
				return itemsFor(this).get(String(key)) ?? null;
			},
			writable: true,
		},
		key: {
			configurable: true,
			value(this: Storage, index: number) {
				return [...itemsFor(this).keys()][index] ?? null;
			},
			writable: true,
		},
		removeItem: {
			configurable: true,
			value(this: Storage, key: string) {
				itemsFor(this).delete(String(key));
			},
			writable: true,
		},
		setItem: {
			configurable: true,
			value(this: Storage, key: string, value: string) {
				itemsFor(this).set(String(key), String(value));
			},
			writable: true,
		},
	});

	Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
}
