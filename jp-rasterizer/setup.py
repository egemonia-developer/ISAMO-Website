from setuptools import setup, find_packages

setup(
    name="jp-rasterizer",
    version="0.1.0",
    description="Rasterizer for Japanese/CJK font glyphs — fork of ndf_rasterizer",
    py_modules=["rasterizer_jp"],
    python_requires=">=3.8",
    install_requires=[
        "numpy",
        "scipy",
        "freetype-py",
        "fonttools",
        "ufoLib2",
        "ufo-extractor>=0.8.1",
        "tqdm",
    ],
    entry_points={
        "console_scripts": [
            "jp-rasterizer=rasterizer_jp:main",
        ]
    },
    license="GPL-3.0",
)
