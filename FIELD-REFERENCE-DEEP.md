# BINDER-OS — DEEP-DIVE FIELD REFERENCE

Every field, extracted directly from source code (`Developershubh00/Binder-frontend`, commit 4974b93).
This is the exhaustive reference — every label, placeholder, dropdown option, and widget type.

**Legend — Widget types:**
- `TenantDropdown` / react-select — searchable/creatable dropdown → automation: `pickOption`
- `text input` — plain field → `setText`
- `number input` — numeric field → `setText`
- `TestingRequirementsInput` — chip multi-select (`.premium-chip`) → `setTestingInput`
- `MultiSelectDropdown` — checkbox multi (`onMouseDown`) → `setMultiSelect`
- `date input` — calendar → `setText`
- `file upload` → `uploadFile`
- `auto / readonly` — derived, do not fill

---

# ═══════════════════════════════════════════
# STEP A — GENERATE BUYER CODE
# ═══════════════════════════════════════════
**File:** `GenerateBuyerCode.jsx` (431 lines) · **API:** POST/GET `ims/buyer-codes/`

| # | Field | Widget | Placeholder | Required | Backend key |
|---|-------|--------|-------------|----------|-------------|
| 1 | BUYER NAME | text input | Enter buyer name | Yes | `buyer_name` |
| 2 | END CUSTOMER | text input | Enter end customer name | Yes | `retailer` |
| 3 | CONTACT PERSON | text input | Enter contact person name | Yes | `contact_person` |

**Behavior:** Backend generates a `code` (e.g. `707A`). Success heading: "Buyer Code Generated".
**Duplicate guard:** identical (buyer_name + retailer) returns the existing code instead of creating a new one.

---

# ═══════════════════════════════════════════
# STEP B — GENERATE IPO CODE
# ═══════════════════════════════════════════
**File:** `InternalPurchaseOrder.jsx` (450 lines) · **API:** POST/GET `ims/ipos/`

| # | Field | Widget | Values / Placeholder | Required | Backend key |
|---|-------|--------|----------------------|----------|-------------|
| 1 | ORDER FOR | dropdown | Company, Production, Sampling | Yes | `order_type` |
| 2 | BUYER CODE | dropdown | (list of buyer codes) | Yes* | `buyer_code_text` |
| 3 | TYPE | dropdown | SAM, STOCK | Yes** | `company_type` |
| 4 | PO NAME | text input | Enter PO name | Yes | `program_name` |

*Buyer Code required only when ORDER FOR = Production or Sampling.
**TYPE (SAM/STOCK) required only when ORDER FOR = Company (then Buyer Code is hidden).

**Output:** `ipo_code` = full project code `CHD/PD/<buyerCode>/<poName>/<seq>`.
Success heading: "Generated IPO Code".

---

# ═══════════════════════════════════════════
# STEP 0 — PRODUCT SPEC (IPC Spec)
# ═══════════════════════════════════════════
**File:** `Step0.jsx` (735 lines) · **Save:** local + popup "IPC Codes Generated" (no network write)

## SKU-level fields (per product card):
| # | Field | Widget | Placeholder | Required |
|---|-------|--------|-------------|----------|
| 1 | BUYER CODE | dropdown (creatable) | Select or type buyer code | Yes |
| 2 | PRODUCT | dropdown (creatable) | Select or type product | Yes |
| 3 | BUYER SKU | dropdown (creatable) | Select or type buyer SKU | Yes |
| 4 | SET OF | number input | 1 | Yes |
| 5 | PO QTY | number input | e.g., 1000 | Yes |
| 6 | OVERAGE (%) | number input | e.g., 5 / e.g. 5% | Yes |
| 7 | DELIVERY DUE DATE | date input | — | Yes |
| 8 | PRODUCT IMAGE | file upload | click to upload | Yes |

## Component sub-fields (repeatable list, per SKU):
| Field | Widget | Placeholder | Notes |
|-------|--------|-------------|-------|
| COMPONENT | text input | Type component name | Free text |
| ASSIGN PLACEMENT | morphing widget | Select placement / Type placement | 1 component → dropdown [TOP PLACEMENT]; 2 → [TOP PLACEMENT, BOTTOM PLACEMENT]; 3+ → free text input |

## Subproduct sub-fields (optional, expandable):
| Field | Widget | Placeholder |
|-------|--------|-------------|
| SUBPRODUCT | dropdown (creatable) | Select or type subproduct |
| BUYER SKU | dropdown | Select or type buyer SKU |
| SET OF | number input | 1 |
| PO QTY | number input | e.g., 1000 |
| OVERAGE % | number input | e.g. 5% |
| SUBPRODUCT IMAGE | file upload | click to upload |

**PRODUCT valid options (creatable):** RUG, BATHRUG, BATHMAT, CARPET, TREE SKIRT,
TOTE BAGS, BAGS, CUSHION, APRON, TABLE RUNNER, PLACEMAT, KITCHEN GLOVES, THROW,
BLANKETS, COMFORTER, QUILT, DUVET, SHEET SET, CURTAIN, SHOWER CURTAIN, BATHROB,
TOWEL, BASKET, OTTOMAN, PET BED, SOFT TOY, FLOOR CUSHION, CHAIRPAD, SHAM, PACKAGING BAG.

**Output:** each SKU generates one IPC code `CHD/<buyer>/PO-<seq>/IPC-<n>`.

---

# ═══════════════════════════════════════════
# PART-1 — BOM & WO (Step2)
# ═══════════════════════════════════════════
**File:** `Step2.jsx` (759 lines) + `rawMaterials/FabricSpec.jsx`
**Save:** per-component → `persistSection('bomwo')` → section draft

## Component base fields:
| # | Field | Widget | Placeholder / Options | Backend key |
|---|-------|--------|----------------------|-------------|
| 1 | (SELECT COMPONENT) | dropdown | Select component | — |
| 2 | MATERIAL TYPE | dropdown | Fabric, Yarn, Trim & Accessory, Foam, Fiber | `materialType` |
| 3 | MATERIAL DESC | text input | e.g., Cotton 200TC | `materialDescription` |
| 4 | NET CNS/PC | number input | 0.000 | `netCns` |
| 5 | UNIT | dropdown | CM, KGS | `unit` |

## MATERIAL TYPE = "Trim & Accessory" → TRIM/ACCESSORY dropdown:
Options: BUCKLES, BUTTONS, CABLE-TIES, CORD STOPS, FELT, HOOKS-EYES, INTERLINING(FUSING),
MAGNETIC CLOSURE, PIN-BARBS, REFLECTIVE TAPES, RINGS-LOOPS, RIVETS, SEAM TAPE,
SHOULDER PADS, VELCRO, NIWAR-WEBBING, RIBBING, LACE, FIRE RETARDANT (FR) TRIMS, ZIPPERS.
(Sub-material placeholder: "Select sub-material (optional)"; e.g. Stitching Thread.)

## MATERIAL TYPE = "Fabric" → FabricSpec fields (FabricSpec.jsx):
| # | Field | Widget | Placeholder / Options | Backend key |
|---|-------|--------|----------------------|-------------|
| 1 | FIBER TYPE | dropdown (creatable) | Select or type Fiber Type | `fabricFiberType` |
| 2 | FABRIC NAME | dropdown (cascade from fiber) | (depends on fiber) | `fabricName` |
| 3 | COMPOSITION | text input | Text | `fabricComposition` |
| 4 | GSM | number input | e.g., 90 | `gsm` |
| 5 | FIBER CATEGORY | dropdown (creatable) | Select or type Fiber Category | `fabricFiberCategory` |
| 6 | CONSTRUCTION TYPE | dropdown | Powerloom, Handloom, Circular Knitting, Flatbed Knitting, Warp Knitting, Others | `constructionType` |
| 7 | WEAVE/KNIT TYPE | dropdown | (varies) | `weaveKnitType` |
| 8 | MACHINE TYPE | dropdown (creatable) | Select or type Machine Type | `fabricMachineType` |
| 9 | ORIGIN | dropdown (creatable) | Select or type Origin | `fabricOrigin` |
| 10 | CERTIFICATION REQUIREMENT | text input | Enter certificate label | `fabricCertifications` |
| 11 | TESTING REQUIREMENTS | chip multi | Select or type Testing Requirements | `fabricTestingRequirements` |
| 12 | APPROVAL | dropdown | Self, QA Approval, Buyer Approval, Initial Sample, PP Sample, White Seal Sample | `fabricApproval` |
| 13 | REMARKS | text input | (free) | `fabricRemarks` |

### FIBER → FABRIC cascade (valid combinations, source: textileFabricData.js):
| Fiber | Valid Fabric Names |
|-------|-------------------|
| Cotton | percale, poplin, muslin, voile, lawn, cambric, Organdy, Sheeting |
| Polyster | taffeta, chiffon, georgette, polyster satin, polyster crepe, polyster twill, polyster microfiber, polyster oxford |
| Linen | Linen Plain Weave, Linen Cambric, Linen Sheeting, Linen Canvas, Linen Damask, Linen Twill, Handkerchief Linen |
| Silk | Silk Charmeuse, Crepe de Chine, Silk Georgette, Silk Chiffon, Silk Taffeta, Habotai, Dupioni, Shantung |
| Wool | Wool Suiting, Gabardine, Serge, Flannel, Melton, Broadcloth, Wool Crepe, Challis |
| Cotton Blends | Poly-Cotton Poplin, Poly-Cotton Twill, CVC Jersey, Cotton-Linen, Cotton-Modal Jersey, Cotton-Spandex Jersey, Cotton-Spandex Twill, Stretch Denim |
| Nylon | Nylon Taffeta, Ripstop, Nylon Oxford, Cordura, Taslan, Tricot, Nylon Spandex, Supplex |

## Work Orders (added per component in BOM, filled in Part-3):
Full work-order field set is documented under PART-3 (WorkOrdersSection).
In BOM, the important WO declarations: CUTTING, SEWING, FINISHING, QUILTING.
FINISHING has a single control here: "Is this required?" (Yes/No).

---

# ═══════════════════════════════════════════
# PART-2 — ARTWORK & LABELING (Step4)
# ═══════════════════════════════════════════
**File:** `Step4.jsx` (689 lines) · **Save:** `persistSection('artwork')`

## Per artwork entry — base fields:
| # | Field | Widget | Placeholder | Backend key |
|---|-------|--------|-------------|-------------|
| 1 | (SELECT COMPONENT) | dropdown | Select component | — |
| 2 | ARTWORK CATEGORY | dropdown (creatable) | Select or type Category | `artworkCategory` / `category` |
| 3 | TYPE | dropdown (creatable) | Select or type Type | (category-specific) |
| 4 | MATERIAL / FIBER CONTENT | dropdown | (Care&Comp shows "FIBER CONTENT", else "MATERIAL") | |
| 5 | SIZE (Width) | number input | — | `sizeWidth` / `size.width` |
| 6 | SIZE (Height) | number input | — | `sizeHeight` / `size.height` |
| 7 | SIZE UNIT | dropdown | MM, CM, INCHES | `sizeUnit` / `size.unit` |
| 8 | PLACEMENT | dropdown | (category-specific) | |
| 9 | ATTACHMENT | dropdown | Sew-in, Heat Seal, Adhesive Back | |
| 10 | TESTING REQUIREMENTS | multi-select | e.g., Wash Fastness | |
| 11 | QTY | number input | e.g., 5000 pcs | |
| 12 | QTY UNIT | dropdown | CM, KGS, PCS | |
| 13 | SURPLUS % | number input | 5% | `surplus` |
| 14 | SURPLUS FOR SECTION | text input | FOR SECTION (e.g., PACKAGING / QUALITY) | `surplusForSection` |
| 15 | USAGE | text input | (e.g., Permanent, High-bond) | `usage` |
| 16 | APPROVAL | dropdown (creatable) | Select or type Approval | `approval` |
| 17 | REMARKS | text input | Additional notes... | `remarks` |
| 18 | REFERENCE IMAGE | file upload | — | `referenceImage` |

## The 17 ARTWORK CATEGORIES (exact strings):
1. LABELS (BRAND/MAIN)
2. CARE & COMPOSITION
3. TAGS & SPECIAL LABELS
4. FLAMMABILITY / SAFETY LABELS
5. RFID / SECURITY TAGS
6. LAW LABEL / CONTENTS TAG
7. HANG TAG SEALS / STRINGS
8. PRICE TICKET / BARCODE TAG
9. HEAT TRANSFER LABELS
10. UPC LABEL / BARCODE STICKER
11. SIZE LABELS (INDIVIDUAL)
12. ANTI-COUNTERFEIT & HOLOGRAMS
13. QC / INSPECTION LABELS
14. BELLY BAND / WRAPPER
15. INSERT CARDS
16. HEADER CARD
17. RIBBONS

## Category-specific TYPE options (source-verified):
| Category | TYPE options |
|----------|-------------|
| LABELS (BRAND/MAIN) | Woven (Damask, Taffeta, Satin), Printed (Satin, Cotton), Heat Transfer, Leather, Metal |
| CARE & COMPOSITION | Woven, Printed, Heat Transfer |
| FLAMMABILITY / SAFETY LABELS | Permanent Sew-in Label, Removable Hang Tag |
| PRICE TICKET / BARCODE TAG | Adhesive Sticker, Printed Area, Dedicated Small Tag |
| ANTI-COUNTERFEIT & HOLOGRAMS | Hologram Sticker, Void/Tamper-Evident Label, Authenticity Patch, Invisible Ink Print |
| QC / INSPECTION LABELS | Passed/Inspected Sticker, Hold/Defective Sticker, Audit Sample Tag |
| BELLY BAND / WRAPPER | Cardboard Sleeve, Printed Paper Band, Plastic Film Wrapper |

## LABELS (BRAND/MAIN) — full field options:
- MATERIAL: Polyester, Cotton, Nylon, Satin, Damask, Recycled Polyester, Organic Cotton
- PLACEMENT: Corner (bedding), Custom, Hem, Neck seam (center back), Side seam, Sleeve
- ATTACHMENT: Adhesive Back, Heat Seal, Sew-in
- SIZE UNIT: CM, INCHES, MM

---

# ═══════════════════════════════════════════
# PART-3 — CUT, SEW & FINISHING (Step1)
# ═══════════════════════════════════════════
**File:** `Step1.jsx` (221 lines) + `cutting/SpecSection.jsx` + `finishing/FinishingSection.jsx` + `workOrders/WorkOrdersSection.jsx`
**Save:** `persistSection('cutsew')` · **Tabs:** Cutting | Sewing | Finishing
**Component selection:** chip buttons (not dropdown) under "Select component".

## The work-order form (WorkOrdersSection) — the full field universe:
This one form renders different fields depending on WORK ORDER type. Every possible field:

### Common WO controls:
| Field | Widget | Placeholder / Options |
|-------|--------|----------------------|
| WORK ORDER | dropdown | Select Work Order |
| CNS/PC | number input | Enter CNS/PC |
| UNIT | dropdown | Select unit (Yardage (CM), PCS, KGS) |
| CUT SIZE / SEW SIZE (L × W) | 2 number inputs | L, W |
| APPROVAL | dropdown | Select or type Approval |
| WASTAGE % | number input | Numeric |
| SURPLUS % | number input | Numeric |
| REMARKS | text input | Enter remarks |
| TESTING REQ. | chip multi | Type to search or select testing requirements... |

### CUTTING-specific:
| Field | Widget | Options |
|-------|--------|---------|
| MACHINE TYPE | dropdown | Select or type Machine Type |
| CUT TYPE | dropdown | (depends on machine) |
| LAYERS | number input | Enter layers |
| NESTING | dropdown | Select or type Nesting |
| PIECES | number input | Enter pieces |

**CUTTING MACHINE TYPES → variants → cut types (cuttingData.js):**
| Machine | Variants | Cut Types |
|---------|----------|-----------|
| SCISSOR | Tailoring Scissor, Electric Scissor | SINGLE PLY, LAYERED (few) |
| STRAIGHT KNIFE | Vertical Knife, End Cutter, Eastman, KM | LAYERED, MULTI-PLY |
| ROUND KNIFE | Circular Blade, Rotary | LAYERED, CURVED |
| BAND KNIFE | Stationary Blade, Table Mounted | LAYERED, PRECISE |
| DIE CUTTER | (die-based variants) | — |

### SEWING-specific:
| Field | Widget | Options |
|-------|--------|---------|
| MACHINE TYPE | dropdown | (sewing machines) |
| SPI | number input | e.g., 8 (stitches per inch) |
| STITCH TYPE | dropdown | Select type |
| THREAD TYPE | dropdown | Select or type Thread Type |
| NEEDLE SIZE | text input | Numeric |
| NEEDLE SPACING | text input | Numeric |
| SEAM (type) | dropdown | — |

### QUILTING-specific:
| Field | Widget | Placeholder |
|-------|--------|-------------|
| QUILTING TYPE | dropdown | Select or type Quilting Type |
| DESIGN REF / REFERENCE IMAGE | file upload | — |
| STITCH LENGTH (MM) | number input | Numeric |
| PATTERN REPEAT | text input | — |
| REPEAT SIZE | text input | L, W |
| COVERAGE % | number input | e.g., 75 |

### PRINTING / EMBROIDERY / DYEING (also in WO universe):
- PRINTING TYPE (dropdown), # OF SCREENS, COLORS, RESOLUTION, DESIGN REF
- STITCH COUNT, THREAD COLORS, HOOP/FRAME SIZE, MACHINE GAUGE (embroidery)
- DYEING TYPE (dropdown), SHRINKAGE LENGTH %, SHRINKAGE WIDTH %

### KNIT/WEAVE construction fields (for knit/woven WOs):
GAUGE, PICK, REED, WALES RATIO, COURSES RATIO, WARP RATIO, WEFT RATIO,
RATIO WEIGHT(WALES), RATIO WEIGHT(COURSE), PITCH/ROWS, TPI (TUFT PER INCH),
TPI / KPSI, PILE HEIGHT (MM), STRAND COUNT, MACHINE GAUGE, CONSTRUCTION.

### FRINGE / TASSEL fields (for fringe WOs):
| Field | Options |
|-------|---------|
| TYPE | Cut Fringe, Chainette, Tassel (individual), Ball Fringe, Brush Fringe, Bullion, Loop Fringe |
| KNOT TYPE | Self-Knotted (through-fabric), Sewn header/tape, Lace/cord tied, Slip-stitch attached, Glued/bonded |
| MATERIAL | Rayon (shiny), Polyester, Cotton, Silk, Metallic, Wool, Jute |
| DROP LENGTH | 2cm, 5cm, 10cm, 15cm, 20cm |
| TAPE/HEADER WIDTH | 10mm, 15mm, 20mm |
| COLORS | DTM, Multi-Coloured, Iridescent, Ombre |
| FINISH | High Sheen, Matte, Twisted, Braided Header |
| ATTACHMENT METHOD | (per KNOT TYPE) |
| QTY | PCS, LENGTH |
| TESTING REQ. | Colour Fastness (light/UV), Wash Resistance, Flammability |
| STITCH RATE / KNOT DENSITY | Knot Density, Fiber Count, Threads per inch |

## FINISHING tab (FinishingSection.jsx) — IPC-level:
| Field | Widget | Placeholder |
|-------|--------|-------------|
| FINISHING PROCESS | dropdown (creatable) | Select or type process |
| PROCESS TYPE | dropdown | (depends on process) |
| REMARKS | text input | Remarks (optional) |

**16 FINISHING PROCESSES → valid TYPES (finishingData.js):**
| Process | Types |
|---------|-------|
| Thread Trimming | Manual, Electric, Precision |
| Shearing | Full Surface, Pattern, High-Low |
| Clipping | Loop, Surface, Pattern |
| Brushing | Soft, Hard, One-way |
| Spot Cleaning | Water, Solvent, Foam |
| Lint Removal | Vacuum, Roller, Air Blow |
| Pressing | Steam, Flat, Roller |
| Fringe Knotting | Single, Double, Decorative |
| Shape Correction | Manual, Steam Blocking |
| Label Attachment | Sewn, Heat Transfer |
| Measurement Check | 100%, Sampling |
| Folding | Retail, Flat, Roll |
| Metal Detection | Manual |
| Barcode Application | Manual |
| Polybag Packing | Individual, Set Pack |
| Carton Packing | Bulk, Retail, Assorted |

**Note:** Completing Finishing stamps "Cut & Sew ✓" on the IPC card.

---

# ═══════════════════════════════════════════
# PACKAGING (Step5) — FINAL, commits everything
# ═══════════════════════════════════════════
**File:** `Step5.jsx` (915 lines) + `PackagingMaterialTypeFields.jsx` (3806 lines!)
**Save:** `handleSaveAndGenerate` = validate + persistSection('packaging') + COMMIT all IPCs

## Header fields:
| # | Field | Widget | Values / Placeholder | Required |
|---|-------|--------|----------------------|----------|
| 1 | TO BE SHIPPED | dropdown | Merged (2+ IPC), Standalone (1 IPC) | Yes |
| 2 | PRODUCT (IPC) | Standalone: dropdown "Select or type IPC" / Merged: checkbox multi "Select IPCs (click to open)" | IPC codes | Yes |
| 3 | MASTER PACK | auto/readonly | Merged → ASSORTED, Standalone → STANDARD | (derived) |
| 4 | CASEPACK QTY (PCS) | number input | 10 | Yes |
| 5 | QTY TO PACK (per IPC) | number input | 0 | Yes (allocation) |
| 6 | PACKAGING MATERIAL TYPE | dropdown | Select or type Material Type (13 options) | Yes (≥1) |

## CASEPACK CALCULATION — PO Reconciliation Ledger (Step5.jsx:117-160):
```
For each IPC:
   PO QTY    = sku.poQty (from IPC-spec)
   PACKED    = Σ across all packs of packQty[ipc]
   AVAILABLE = PO − (allocated in OTHER packs)   [cap for this pack]
   BALANCE   = PO − PACKED
   STATUS    = Nil (balance=0 ✓) | Pending (balance>0) | Over by X (balance<0 ✗)
```
**Guards:** over-pack is blocked; a pending balance triggers a confirm popup before commit;
all-Nil allows a clean commit.

## 13 PACKAGING MATERIAL TYPES (exact strings):
CARTON BOX, CORNER PROTECTORS, EDGE PROTECTORS, FOAM INSERT, PALLET STRAP, DIVIDER,
TAPE, POLYBAG~POLYBAG-FLAP, POLYBAG~Bale, SILICA GEL DESICCANT, SHRINK TAPE, VOID~FILL,
SHIPPING MARK.

## CARTON BOX — required fields (simplest type):
| # | Field key | Label | Widget | Options |
|---|-----------|-------|--------|---------|
| 1 | cartonBoxType | TYPE | dropdown | Die-Cut, FOL (Full Overlap), HSC (Half Slotted), Inner Carton, Master Carton, RSC (Regular Slotted Container), Telescope |
| 2 | cartonBoxNoOfPlys | # OF PLYS | dropdown | 3 Ply, 5 Ply, 7 Ply, 9 Ply |
| 3 | cartonBoxBoardGrade | BOARD GRADE | dropdown | Duplex, Kraft (Brown), Test Liner, Virgin Kraft, White Top |
| 4 | cartonBoxJointType | JOINT TYPE | dropdown | Glued/Binded, Staple/Stitched, Taped |
| 5 | cartonBoxBurstingStrength | BURSTING STRENGTH | text input | e.g., 175 lbs, 200 lbs, 275 lbs |
| 6 | cartonBoxStiffenerRequired | STIFFENER REQUIRED | dropdown | YES, NO |
| 7 | cartonBoxLength / Width / Height | DIMENSIONS (L/W/H) | 3 number inputs | Length, Width, Height |
| 8 | cartonBoxDimensionsUnit | (dimensions unit) | UnitDropdown | CM, INCHES, MM |
| 9 | cartonBoxTestingRequirements | TESTING | chip multi | Bursting Strength Test, ECT Test, Drop Test, Compression Test |
| 10 | cartonBoxSurplus | SURPLUS % | number input | — |
| 11 | cartonBoxWastage | WASTAGE % | number input | — |

**Conditional (only when STIFFENER REQUIRED = YES):**
cartonBoxStiffenerNoOfPlys (# OF PLYS: 3/5/7/9 Ply), cartonBoxQuantity (QUANTITY: pieces),
cartonBoxStiffenerLength, cartonBoxStiffenerWidth, cartonBoxStiffenerUnit.

## Other 12 material types — required-field counts (validationSchemas.js:607):
| Type | # required fields | Key discriminator fields |
|------|-------------------|--------------------------|
| CORNER PROTECTORS | 13 | type: Edge Guard/L-Shape/U-Shape/Wrap-Around; material: Cardboard/Corrugated Board/Foam (EPE/EVA)/Plastic (PP/PE)/Wood |
| EDGE PROTECTORS | 10 | type: Flat Strip/L-Board/U-Channel/V-Board/Wrap-Around; material: Corrugated/Laminated Board/Metal (Aluminum)/Plastic/Solid Board |
| FOAM INSERT | 8 | type, material, density, thickness, color, qty, surplus, wastage |
| PALLET STRAP | 10 | type, application, width, seal type, seal size, color |
| DIVIDER | 14 | type, material, cell config, cell size L/W/unit, height, board thickness, slot depth |
| TAPE | 12 | type, material, gauge, width, length, gumming quality, application, testing |
| POLYBAG~POLYBAG-FLAP | 10 | packaging type, inner casepack, type, material, flap required, testing, qty |
| POLYBAG~Bale | 13 | packaging type, inner casepack, type, material, gauge/gsm, roll width, colour, testing |
| SILICA GEL DESICCANT | 9 | type, form, unit size, color, placement, qty, casepack logic |
| SHRINK TAPE | 9 | type, material, width, thickness/gauge, cling, color, qty |
| VOID~FILL | 9 | type, material, paper type, paper weight, color, qty (+conditional: Air Pillows / Bubble Wrap) |
| SHIPPING MARK | 11 | type, material, artwork spec (upload), size W/H/unit, placement text, testing, qty |

**SHIPPING MARK sub-options (PackagingMaterialTypeFields.jsx):**
- TYPE: Adhesive Sticker (on packaging/hang tag), Pre-Printed on Carton, Pre-Printed Barcode Area
- MATERIAL: Thermal Transfer Paper, Direct Thermal Paper, White Matte Label Stock, Synthetic
- TESTING: Colour Fastness (Wash/Rubbing), Shrinkage, Needle Detection (metallic thread), Barcode Verification Report (Grade A/B), Scan Rate Audit (100% POS)
- BARCODE STANDARD: UPC-A (12 digit), EAN-13 (13 digit), Code 128, ITF-14 (carton)
- PRINT METHOD: Thermal Transfer, Direct Thermal, Laser, Pre-Printed
- VARIABLE DATA: SKU, Size, Color, Price, Sequential Number

## Extra packs:
Leftover IPCs (not in the main pack) go into additional pack blocks with the same
structure (TO BE SHIPPED, IPC selection, CASEPACK QTY, materials). The PO reconciliation
sums allocations across the main pack + all extra packs.

---

# ═══════════════════════════════════════════
# CROSS-CUTTING REFERENCE
# ═══════════════════════════════════════════

## Unit option sets (unitOptions.js):
- `UNIT_OPTIONS` = CM, KGS
- `UNIT_OPTIONS_WITH_PCS` = CM, KGS, PCS
- `WORK_ORDER_UNIT_OPTIONS` = Yardage (CM), PCS, KGS

## Approval option sets (approvalOptions.js):
- General APPROVAL: Self, QA Approval, Buyer Approval, Initial Sample, PP Sample, White Seal Sample
- WORK_ORDER_APPROVAL_OPTIONS and PACKAGING_APPROVAL_OPTIONS are separate sets.

## Two backend save stores:
| Store | Endpoint | Written by |
|-------|----------|-----------|
| Draft / section | `factory-codes/sections/` (GET), `factory-codes/section/` (PUT) | each step's Save: bomwo / artwork / cutsew / packaging |
| Committed | `factory-codes/?ipo=` (GET) | ONLY packaging's "Save & Generate" |

## sku_key format: `product_0`, `product_1`, … (subproducts: `subproduct_0_1`).

## Portal gate: "Proceed to Packaging →" requires every IPC to have BOM ✓ + Artwork ✓ + Cut&Sew ✓.

## API base: `https://binder-backend-0szj.onrender.com/api/` · Auth: `Bearer <access_token>` (localStorage).
