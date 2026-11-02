<?php
/**
 * Render callback for the Master Scores block.
 *
 * Outputs the score wrapper, hydrates `data-score` with the serialized
 * score, and enqueues the frontend renderer + local VexFlow fonts.
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content (unused).
 * @var WP_Block $block      Block instance.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$score = isset( $attributes['score'] ) ? $attributes['score'] : array();

if ( empty( $score ) ) {
	return;
}

// Sanity-check the shape so a corrupted attribute cannot break the frontend.
if ( empty( $score['tracks'][0]['measures'] ) ) {
	return;
}
$json = wp_json_encode( $score );

// Absolute path to the built view.js and its public URL.
$plugin_main_file = __FILE__;
$view_js_path     = plugin_dir_path( $plugin_main_file ) . 'build/view.js';
$view_js_url      = plugins_url( 'build/view.js', $plugin_main_file );

// Absolute path to the fonts directory (used by VexFlow's font loader).
$fonts_path = plugin_dir_path( $plugin_main_file ) . 'build/fonts/';
$fonts_url  = plugins_url( 'build/fonts/', $plugin_main_file );

// Enqueue the frontend script only when the block is actually rendered.
if ( ! wp_script_is( 'master-scores-view', 'enqueued' ) ) {
	wp_enqueue_script(
		'master-scores-view',
		$view_js_url,
		array(),
		file_exists( $view_js_path ) ? filemtime( $view_js_path ) : '1.0.0',
		true
	);

	// Expose the build/fonts URL so VexFlow loads Bravura/Academico
	// from our own plugin folder instead of the jsDelivr CDN.
	wp_localize_script(
		'master-scores-view',
		'MasterScoresData',
		array(
			'fontUrl' => $fonts_url,
		)
	);
}

$title    = isset( $score['metadata']['title'] ) ? $score['metadata']['title'] : '';
$composer = isset( $score['metadata']['composer'] ) ? $score['metadata']['composer'] : '';
?>
<div class="wp-block-create-block-master-scores">
	<div class="master-scores-score-panel">
		<div class="master-scores-header">
			<h2><?php echo esc_html( $title ); ?></h2>
			<p><?php echo esc_html( $composer ); ?></p>
		</div>
		<div
			class="master-scores-canvas"
			data-score="<?php echo esc_attr( $json ); ?>"
		></div>
	</div>
</div>