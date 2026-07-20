function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getLastValue(lastRecord, cid) {
  return lastRecord?.catalogs?.find((item) => item.cid === cid)?.value;
}

function readCustomValue(customFields, cid) {
  if (!customFields || typeof customFields !== "object") {
    return undefined;
  }
  return customFields[cid];
}

function normalizeListText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "");
}

function findGroupedNameListValue(catalog, rawName) {
  const name = String(rawName || "").trim();
  const groups = catalog.config?.NAME_LIST?.content?.groups;
  if (!name || !Array.isArray(groups)) return null;

  const normalizedInput = normalizeListText(name);
  const candidates = [];

  for (const group of groups) {
    if (group?.status === -1 || !Array.isArray(group?.value)) continue;

    const groupId = String(group.groupId || "").trim();
    const groupName = String(group.groupName || "").trim();
    const normalizedGroup = normalizeListText(groupName);

    for (const item of group.value) {
      if (item?.status === -1) continue;
      const itemName = String(item?.name || "").trim();
      if (!groupId || !itemName) continue;

      const normalizedName = normalizeListText(itemName);
      let score = 0;

      if (normalizedInput === normalizeListText(`${itemName}${groupId}`)) {
        score = 110;
      } else if (normalizedInput === `${normalizedGroup}${normalizedName}`) {
        score = 100;
      } else if (normalizedInput.includes(normalizedGroup) && normalizedInput.endsWith(normalizedName)) {
        score = 90;
      } else if (normalizedInput === normalizedName) {
        score = 70;
      }

      if (score > 0) {
        candidates.push({
          groupId,
          name: itemName,
          score,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;

  const tied = candidates.filter((candidate) => candidate.score === best.score);
  if (best.score < 90 && tied.length > 1) {
    return null;
  }

  return `${best.name} ${best.groupId}`;
}

function resolveNameListValue(catalog, rawName) {
  const name = String(rawName || "").trim();
  if (!name) return "";

  const isGroupedNameList =
    catalog.config?.NAME_LIST?.active &&
    catalog.config?.NAME_LIST_ACTIVE_TYPE?.content === "GROUP";

  if (!isGroupedNameList) {
    return name;
  }

  return findGroupedNameListValue(catalog, name) || name;
}

function buildLocationValue(catalog, customValue, lastValue, userDefaults) {
  const specifiedLocation = catalog.config?.SPECIFIED_LOCATION;
  if (
    specifiedLocation?.active &&
    Array.isArray(specifiedLocation.content?.locations) &&
    specifiedLocation.content.locations.length > 0
  ) {
    const location = specifiedLocation.content.locations[0];
    return {
      address: location.address || userDefaults.defaultAddress || "",
      title: location.specifiedAddress || userDefaults.defaultAddress || "",
      location: {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
      },
      specifiedAddress: location.specifiedAddress || "",
      setupLongitude: location.longitude,
      setupLatitude: location.latitude,
      setupAddress: location.address || "",
    };
  }

  if (
    customValue &&
    typeof customValue === "object" &&
    customValue.lat !== "" &&
    customValue.lng !== ""
  ) {
    const lat = Number(customValue.lat);
    const lng = Number(customValue.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      const address = customValue.address || userDefaults.defaultAddress || "";
      return {
        address,
        title: address,
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        specifiedAddress: address,
        setupLongitude: lng,
        setupLatitude: lat,
        setupAddress: address,
      };
    }
  }

  if (
    typeof userDefaults.defaultLng === "number" &&
    typeof userDefaults.defaultLat === "number"
  ) {
    return {
      address: userDefaults.defaultAddress || "",
      title: userDefaults.defaultAddress || "",
      location: {
        type: "Point",
        coordinates: [userDefaults.defaultLng, userDefaults.defaultLat],
      },
      specifiedAddress: userDefaults.defaultAddress || "",
      setupLongitude: userDefaults.defaultLng,
      setupLatitude: userDefaults.defaultLat,
      setupAddress: userDefaults.defaultAddress || "",
    };
  }

  return cloneValue(lastValue) || "";
}

function buildRadioValue(catalog, customValue, lastValue) {
  const options = catalog.config?.OPTIONS?.content || [];
  if (customValue != null && customValue !== "") {
    return customValue;
  }
  if (lastValue != null && lastValue !== "") {
    return cloneValue(lastValue);
  }
  const firstOption = options[0];
  return firstOption?.value || firstOption?.label || "";
}

function buildCheckboxValue(customValue, lastValue) {
  if (Array.isArray(customValue)) {
    return customValue;
  }
  if (Array.isArray(lastValue)) {
    return cloneValue(lastValue);
  }
  return [];
}

function buildWordValue(catalog, customValue, lastValue, userDefaults) {
  if (catalog.config?.NAME_LIST?.active && userDefaults.displayName) {
    return resolveNameListValue(catalog, userDefaults.displayName);
  }
  if (customValue != null && customValue !== "") {
    return resolveNameListValue(catalog, customValue);
  }
  if (lastValue != null && lastValue !== "") {
    return cloneValue(lastValue);
  }
  return "";
}

function buildDateValue() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function buildPayload(catalogs, lastRecord, userDefaults, customFields) {
  const fields = Array.isArray(catalogs) ? catalogs : [];
  const payload = [];

  for (const catalog of fields) {
    const customValue = readCustomValue(customFields, catalog.cid);
    const lastValue = getLastValue(lastRecord, catalog.cid);
    const item = {
      cid: catalog.cid,
      type: catalog.type,
      value: "",
    };

    switch (catalog.type) {
      case "LOCATION":
        item.value = buildLocationValue(catalog, customValue, lastValue, userDefaults);
        break;
      case "IMAGE":
        if (customValue != null && customValue !== "") {
          item.value = Array.isArray(customValue) ? customValue : [customValue];
        } else if (lastValue != null) {
          item.value = cloneValue(lastValue);
        } else {
          item.value = [];
        }
        break;
      case "DATE":
        item.value = buildDateValue();
        break;
      case "WORD":
      case "TEXTAREA":
      case "NUMBER":
      case "NUMBER_FLOAT":
      case "TELEPHONE":
      case "ID_CARD":
        item.value = buildWordValue(catalog, customValue, lastValue, userDefaults);
        break;
      case "RADIO":
      case "RADIO_V2":
        item.value = buildRadioValue(catalog, customValue, lastValue);
        break;
      case "CHECKBOX":
      case "CHECKBOX_V2":
        item.value = buildCheckboxValue(customValue, lastValue);
        break;
      default:
        if (customValue != null) {
          item.value = cloneValue(customValue);
        } else if (lastValue != null) {
          item.value = cloneValue(lastValue);
        } else {
          item.value = "";
        }
        break;
    }

    payload.push(item);
  }

  return payload;
}

module.exports = {
  buildPayload,
};
