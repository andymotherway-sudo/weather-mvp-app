# Map layer thumbnails

Layer selector thumbnails render at 58 x 46 logical pixels with a 14 px corner radius.

Create PNG assets at 174 x 138 px for crisp 3x Android density. Keep important visual content inside the center because the UI crops with `resizeMode="cover"`.

To wire a thumbnail:

1. Save the PNG in this folder with a descriptive kebab-case name.
2. Add a static `require(...)` entry in `app/lib/maps/layerThumbnails.ts`, keyed by the layer id.
3. Existing generated previews remain as fallbacks for layers without a custom image.

