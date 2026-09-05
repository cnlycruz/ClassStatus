# Third-party notices

ClassStatus includes or derives material from the projects below. These notices apply in addition to the ClassStatus [MIT License](LICENSE).

## Philippines JSON Maps

The NCR geometry in `src/data/ncrGeoData.ts` is derived from the 2023 high-resolution municipality/city GeoJSON files in [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps), pinned to revision `8eeead560246863c8c820c31ca6fbca81a279477`.

ClassStatus selects the four NCR district files, projects longitude/latitude coordinates into an 800 × 1000 SVG coordinate space, rounds coordinates to one decimal place, assigns ClassStatus LGU identifiers and label anchors, and represents Caloocan's two geographic polygons as one logical LGU status. The regeneration script is `scripts/convertGeo.mjs`.

The upstream project identifies its source as Philippine administrative-boundary shapefiles using PSGC data updated as of 31 December 2023. ClassStatus does not claim that the transformed geometry is an official government publication.

The MIT License (MIT)

Copyright (c) James Faeldon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Inter font

ClassStatus distributes Inter font files under the SIL Open Font License 1.1.

Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)

The complete license text is included at `public/fonts/INTER-LICENSE.txt`.
