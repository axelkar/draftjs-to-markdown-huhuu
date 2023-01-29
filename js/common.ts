/**
 * Utility function to execute callback for eack key->value pair.
 */
export function forEach<V>(obj: Record<string, V>, callback: (key: string, value: V) => void): void {
	if (obj) {
		Object.keys(obj).forEach((key) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			if (Object.hasOwn(obj, key)) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				callback(key, obj[key]);
			}
		});
	}
}

/**
 * The function returns true if the string passed to it has no content.
 */
export function isEmptyString(str: string | undefined | null): boolean {
	if (
		str === undefined
		|| str === null
		|| str.length === 0
		|| str.trim().length === 0
	) {
		return true;
	}
	return false;
}

/**
 * Function to check if a block is of type list.
 */
export function isList(blockType: string): boolean {
	return (
		blockType === 'unordered-list-item' || blockType === 'ordered-list-item'
	);
}
