/**
 * Narrow object-storage boundary used by durable cleanup workers.
 * Implementations must treat deleting an already-missing key as success.
 */
export interface ObjectDeletePort {
	deleteObject(objectKey: string): Promise<void>;
}
