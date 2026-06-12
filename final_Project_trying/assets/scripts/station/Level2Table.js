const StationBase = require('./StationBase');

const DEVICE_PARTS = {
    iPhone_checked:       ['iPhone'],
    Airpods_checked:      ['Airpods'],
    charger_checked:      ['charger'],
    box:                  ['box'],
    box_iPhone:           ['box', 'iPhone'],
    box_Airpods:          ['box', 'Airpods'],
    box_charger:          ['box', 'charger'],
    box_iPhone_Airpods:   ['box', 'iPhone', 'Airpods'],
    box_iPhone_charger:   ['box', 'iPhone', 'charger'],
    box_Airpods_charger:  ['box', 'Airpods', 'charger'],
    box_all:              ['box', 'iPhone', 'Airpods', 'charger'],
};

const DEVICE_RESULT_BY_KEY = {
    'box,iPhone':                  'box_iPhone',
    'box,Airpods':                 'box_Airpods',
    'box,charger':                 'box_charger',
    'box,iPhone,Airpods':          'box_iPhone_Airpods',
    'box,iPhone,charger':          'box_iPhone_charger',
    'box,Airpods,charger':         'box_Airpods_charger',
    'box,iPhone,Airpods,charger':  'box_all',
};

const CHECKED_DEVICE_NAMES = ['iPhone_checked', 'Airpods_checked', 'charger_checked'];
const PART_ORDER = ['box', 'iPhone', 'Airpods', 'charger'];

cc.Class({
    extends: StationBase,

    _getAssemblyResult(tableItemName, handItemName) {
        const tableItem = this._normalizeLevel2ItemName(tableItemName);
        const handItem = this._normalizeLevel2ItemName(handItemName);

        return this._getDeviceBoxAssemblyResult(tableItem, handItem);
    },

    _getDeviceBoxAssemblyResult(a, b) {
        const aParts = DEVICE_PARTS[a];
        const bParts = DEVICE_PARTS[b];
        if (!aParts || !bParts) return null;

        // If the table only has one checked device, the next item must be a plain box.
        if (CHECKED_DEVICE_NAMES.indexOf(a) !== -1 && b !== 'box') return null;
        if (CHECKED_DEVICE_NAMES.indexOf(b) !== -1 && a !== 'box' && aParts.indexOf('box') === -1) return null;

        const merged = [];
        aParts.concat(bParts).forEach(part => {
            if (merged.indexOf(part) === -1) merged.push(part);
        });

        if (merged.length !== aParts.length + bParts.length) return null;
        if (merged.indexOf('box') === -1) return null;

        const key = PART_ORDER.filter(part => merged.indexOf(part) !== -1).join(',');
        return DEVICE_RESULT_BY_KEY[key] || null;
    },

    _normalizeLevel2ItemName(itemName) {
        return String(itemName || '').replace(/^noncooked_/, '');
    },
});
