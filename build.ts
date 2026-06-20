import { mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(import.meta.url).slice(0, import.meta.url.lastIndexOf('/'));

// ============================================================================
// Configuration with CLI overrides
// ============================================================================

const defaults = {
	outDirBrowser: './dist/engine/core',
	outDirDebug: './dist/engine/debug',
	outDirModule: './lib',
	srcDir: './src',
	debugDir: './debug',
	minify: true,
	sourcemap: true as boolean,
	clean: true,
};

// Parse CLI arguments
const args = process.argv.slice(2);
const flags = new Set(args);

// Override defaults from CLI
const config = { ...defaults };
for (const arg of args) {
	if (arg.startsWith('--out=')) {
		const val = arg.slice(6);
		config.outDirBrowser = join(val, 'engine/core');
		config.outDirDebug = join(val, 'engine/debug');
		config.outDirModule = join(val, 'lib');
	} else if (arg.startsWith('--src=')) {
		config.srcDir = arg.slice(6);
	} else if (arg === '--no-minify') {
		config.minify = false;
	} else if (arg === '--no-sourcemap') {
		config.sourcemap = false;
	} else if (arg === '--no-clean') {
		config.clean = false;
	}
}

const OUT_DIR_BROWSER = resolve(config.outDirBrowser);
const OUT_DIR_DEBUG = resolve(config.outDirDebug);
const OUT_DIR_MODULE = resolve(config.outDirModule);
const SRC_DIR = resolve(config.srcDir);
const DEBUG_DIR = resolve(config.debugDir);

const commonBuildOptions = {
	target: 'browser' as const,
	format: 'esm' as const,
	sourcemap: config.sourcemap ? 'linked' as const : false,
	minify: config.minify,
};

// ============================================================================
// Cross-platform cleanup
// ============================================================================

async function crossPlatformRemove(targets: string[]): Promise<void> {
	for (const target of targets) {
		try {
			await rm(target, { recursive: true, force: true });
		} catch {
			// Target may not exist; ignore ENOENT
		}
	}
}

// ============================================================================
// Build functions
// ============================================================================

async function buildModule(): Promise<void> {
	console.log('📦 Building ES module...');

	const result = await Bun.build({
		entrypoints: [join(SRC_DIR, 'index.ts')],
		outdir: OUT_DIR_MODULE,
		naming: 'monogatari.module.js',
		...commonBuildOptions,
	});

	if (!result.success) {
		console.error('❌ Module build failed:');
		for (const log of result.logs) {
			console.error(log);
		}
		process.exit(1);
	}

	console.log('✅ ES module built successfully');
}

async function buildBrowser(): Promise<void> {
	console.log('🌐 Building browser bundle...');

	const result = await Bun.build({
		entrypoints: [join(SRC_DIR, 'browser.ts')],
		outdir: OUT_DIR_BROWSER,
		naming: 'monogatari.js',
		target: 'browser',
		format: 'iife',
		sourcemap: config.sourcemap ? 'linked' : false,
		minify: config.minify,
	});

	if (!result.success) {
		console.error('❌ Browser build failed:');
		for (const log of result.logs) {
			console.error(log);
		}
		process.exit(1);
	}

	console.log('✅ Browser bundle built successfully');
}

async function buildDebug(): Promise<void> {
	console.log('🐛 Building debug script...');

	const result = await Bun.build({
		entrypoints: [join(DEBUG_DIR, 'index.js')],
		outdir: OUT_DIR_DEBUG,
		naming: 'debug.js',
		target: 'browser',
		format: 'iife',
		sourcemap: config.sourcemap ? 'linked' : false,
		minify: config.minify,
	});

	if (!result.success) {
		console.error('❌ Debug build failed:');
		for (const log of result.logs) {
			console.error(log);
		}
		process.exit(1);
	}

	console.log('✅ Debug script built successfully');
}

async function buildCSS(): Promise<void> {
	console.log('🎨 Building CSS...');

	const result = await Bun.build({
		entrypoints: [join(SRC_DIR, 'index.css')],
		outdir: OUT_DIR_BROWSER,
		naming: 'monogatari.css',
		minify: config.minify,
		sourcemap: config.sourcemap ? 'linked' : false,
	});

	if (!result.success) {
		console.error('❌ CSS build failed:');
		for (const log of result.logs) {
			console.error(log);
		}
		process.exit(1);
	}

	console.log('✅ CSS built successfully');
}

async function buildTypes(): Promise<void> {
	console.log('📝 Building type declarations...');

	const proc = Bun.spawn(['bunx', 'tsc', '--emitDeclarationOnly', '--declarationDir', join(OUT_DIR_BROWSER, '../types')], {
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		console.error('❌ Type declarations build failed');
		process.exit(1);
	}

	console.log('✅ Type declarations built successfully');
}

// ============================================================================
// Watch mode
// ============================================================================

async function watchMode(): Promise<void> {
	console.log('👀 Starting watch mode...');
	console.log(`   Source: ${SRC_DIR}`);
	console.log(`   Output: ${OUT_DIR_BROWSER}`);

	// Initial build
	await Promise.all([buildBrowser(), buildCSS()]);

	// Watch for changes
	const watcher = Bun.spawn([
		'bun',
		'build',
		join(SRC_DIR, 'browser.ts'),
		'--target', 'browser',
		'--format', 'iife',
		'--outdir', OUT_DIR_BROWSER,
		'--watch',
		...(config.sourcemap ? [] : ['--no-sourcemap']),
		...(!config.minify ? ['--no-minify'] : []),
	], {
		stdout: 'inherit',
		stderr: 'inherit',
	});

	console.log('🔄 Watching for changes... (Press Ctrl+C to stop)');

	await watcher.exited;
}

// ============================================================================
// Main execution
// ============================================================================

async function main(): Promise<void> {
	// Show config
	if (flags.has('--help') || flags.has('-h')) {
		console.log(`
Monogatari Build Tool

Usage: bun build.ts [options] [target]

Options:
  --watch              Watch mode (rebuild on changes)
  --module             Build ES module only
  --browser            Build browser bundle only
  --css                Build CSS only
  --debug              Build debug script only
  --types              Build type declarations only
  --out=<dir>          Output directory (default: ./dist)
  --src=<dir>          Source directory (default: ./src)
  --no-minify          Disable minification
  --no-sourcemap       Disable source maps
  --no-clean           Skip cleaning before build
  --help, -h           Show this help

Targets (mutually exclusive):
  --watch, --module, --browser, --css, --debug, --types

Examples:
  bun build.ts                    # Full build
  bun build.ts --watch            # Watch mode
  bun build.ts --css --no-minify  # CSS only, unminified
  bun build.ts --out=./custom     # Custom output directory
		`);
		process.exit(0);
	}

	// Clean before full build
	if (config.clean && !flags.has('--module') && !flags.has('--browser') && !flags.has('--css') && !flags.has('--debug') && !flags.has('--types')) {
		console.log('🧹 Cleaning previous build artifacts...\n');
		await crossPlatformRemove([
			OUT_DIR_BROWSER,
			OUT_DIR_DEBUG,
			OUT_DIR_MODULE,
		]);
	}

	// Ensure output directories exist
	await mkdir(OUT_DIR_BROWSER, { recursive: true });
	await mkdir(OUT_DIR_DEBUG, { recursive: true });
	await mkdir(OUT_DIR_MODULE, { recursive: true });

	// Execute based on flags
	if (flags.has('--watch')) {
		await watchMode();
	} else if (flags.has('--module')) {
		await buildModule();
	} else if (flags.has('--browser')) {
		await buildBrowser();
	} else if (flags.has('--css')) {
		await buildCSS();
	} else if (flags.has('--debug')) {
		await buildDebug();
	} else if (flags.has('--types')) {
		await buildTypes();
	} else {
		// Full build
		console.log('🚀 Starting full build...\n');

		await Promise.all([
			buildModule(),
			buildBrowser(),
			buildCSS(),
			buildDebug(),
		]);

		await buildTypes();

		console.log('\n🎉 Build completed successfully!');
		console.log(`   Output: ${OUT_DIR_BROWSER.replace('/engine/core', '')}`);
	}
}

main().catch((error) => {
	console.error('💥 Build failed:', error);
	process.exit(1);
});
