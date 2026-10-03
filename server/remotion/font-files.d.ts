// Webpack (the Remotion bundle) turns an imported font file into its URL.
declare module "*.woff2" {
	const url: string;
	export default url;
}
