# Spreadsheet fixtures

`palette.xls` and `palette.xlsx` are exported from `palette.fods` (a flat OpenDocument
spreadsheet you can read as XML) with LibreOffice:

```bash
soffice --headless --convert-to xls palette.fods
soffice --headless --convert-to xlsx palette.fods
```

The first sheet has a title row, a heading row with alternative names ("Hex code",
"Category"), hex colors with and without `#`, an `rgb()` color, numbers, a boolean,
a formula, a row without a color, a blank row and non-Latin characters. The second sheet
must be ignored. Keep every name generic (see the content rule in CLAUDE.md).
