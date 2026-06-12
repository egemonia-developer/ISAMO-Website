// centra_oggetti.jsx
// Centra tutti gli oggetti (singolarmente) al centro della propria pagina.
// Compatibile con InDesign CS4+ e CC.
#target indesign

(function () {
    if (!app.documents.length) {
        alert("Nessun documento aperto.");
        return;
    }

    var doc = app.activeDocument;

    // Salva unità di misura correnti e imposta punti per precisione
    var origH = doc.viewPreferences.horizontalMeasurementUnits;
    var origV = doc.viewPreferences.verticalMeasurementUnits;
    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
    doc.viewPreferences.verticalMeasurementUnits  = MeasurementUnits.POINTS;

    var moved   = 0;
    var skipped = 0;

    for (var i = 0; i < doc.pages.length; i++) {
        var page  = doc.pages[i];
        var items = page.allPageItems;

        if (items.length === 0) continue;

        var pb = page.bounds;                   // [top, left, bottom, right]
        var pageCX = (pb[1] + pb[3]) / 2;      // centro orizzontale
        var pageCY = (pb[0] + pb[2]) / 2;      // centro verticale

        for (var j = 0; j < items.length; j++) {
            var item = items[j];

            // Salta i figli di un gruppo: si sposta il gruppo padre, non i singoli elementi
            if (item.parent instanceof Group) continue;

            try {
                var b = item.geometricBounds;   // [top, left, bottom, right]
                var w = b[3] - b[1];
                var h = b[2] - b[0];

                var newTop  = pageCY - h / 2;
                var newLeft = pageCX - w / 2;

                item.geometricBounds = [newTop, newLeft, newTop + h, newLeft + w];
                moved++;
            } catch (e) {
                // Elementi bloccati, ancorati in testo o su master page vengono saltati
                skipped++;
            }
        }
    }

    // Ripristina unità di misura originali
    doc.viewPreferences.horizontalMeasurementUnits = origH;
    doc.viewPreferences.verticalMeasurementUnits   = origV;

    alert(
        "Completato!\n\n" +
        "Pagine elaborate:        " + doc.pages.length + "\n" +
        "Oggetti centrati:        " + moved  + "\n" +
        "Oggetti saltati:         " + skipped + "\n\n" +
        "(Saltati = bloccati, ancorati nel testo o su master page)"
    );
})();
