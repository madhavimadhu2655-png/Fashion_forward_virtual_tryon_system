| ID | Shop photo | Dimensions | MB | tryon.png | mask.png | API asset_available |
|---|---|---|---|---|---|---|
| CT001 | yes (JPEG, RGB) | 1067x1600 | 0.3 | absent | absent | false |
| CT002 | yes (JPEG, RGB) | 1066x1600 | 0.1 | absent | absent | false |
| CT003 | yes (JPEG, RGB) | 1200x1600 | 0.18 | absent | absent | false |
| CT004 | yes (JPEG, RGB) | 1067x1600 | 0.16 | absent | absent | false |
| CT005 | yes (JPEG, RGB) | 1067x1600 | 0.22 | absent | absent | false |
| CT006 | yes (JPEG, RGB) | 1067x1600 | 0.39 | absent | absent | false |
| CT007 | yes (JPEG, RGB) | 1067x1600 | 0.18 | absent | absent | false |
| CT008 | yes (JPEG, RGB) | 1067x1600 | 0.22 | absent | absent | false |
| CT009 | yes (JPEG, RGB) | 1200x778 | 0.18 | absent | absent | false |
| CT010 | yes (JPEG, RGB) | 1095x1600 | 0.16 | absent | absent | false |
| CT011 | yes (JPEG, RGB) | 1067x1600 | 0.11 | absent | absent | false |
| CT012 | yes (JPEG, RGB) | 1067x1600 | 0.2 | absent | absent | false |
| CT013 | yes (JPEG, RGB) | 1067x1600 | 0.18 | absent | absent | false |
| CT014 | yes (JPEG, RGB) | 1067x1600 | 0.24 | absent | absent | false |
| CT015 | yes (JPEG, RGB) | 1069x1600 | 0.26 | absent | absent | false |
| CT016 | yes (JPEG, RGB) | 1067x1600 | 0.2 | absent | absent | false |
| CT017 | yes (JPEG, RGB) | 898x1600 | 0.19 | absent | absent | false |
| CT018 | yes (JPEG, RGB) | 908x1600 | 0.25 | absent | absent | false |
| CT019 | yes (JPEG, RGB) | 1067x1600 | 0.25 | absent | absent | false |
| CT020 | yes (JPEG, RGB) | 1067x1600 | 0.24 | absent | absent | false |

## Visual observations (eyeballed from a contact sheet; not automated)
Photo vs. catalogue colour/description looks inconsistent for some items, so
check before the demo: CT009 (photo: red sequin; catalogue: Gold/Silver),
CT011 (photo: yellow; catalogue: Beige/White), CT017 (photo: blue gingham;
catalogue: Cream/Brown), CT018 (photo: pink sheer sleeves; catalogue:
White/Black/Sage), CT016 (photo looks like a knotted shirt; catalogue:
Tie-Front Denim), CT014 ("Pack of 2" photo shows two people in two tops).
CT009 is landscape; all others portrait.

## Recommended next action
Sourcing is the only real fix: obtain 1-2 flat-lay / ghost-mannequin photos
you own or have a licence for (plain crop tops on a plain background), cut
them out, and save as `garment-assets/<ID>/tryon.png` (+ `mask.png`). The
existing endpoint and TPS pipeline pick them up with no code change. Until
then every product correctly shows the "try-on unavailable" state.
