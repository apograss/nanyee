import React, { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { Button, Input, Label } from "@/components/ui.jsx";

const DEFAULT_CENTER = [113.28735, 22.805618];
const DEFAULT_AMAP_KEY = "52b9f454686ff6809ca7b1f22222b4de";
const DEFAULT_AMAP_SECURITY_CODE = "cab9b37a55c76105364d31db4881d249";
let amapPromise;

function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapPromise) return amapPromise;
  const key = import.meta.env.VITE_AMAP_KEY || DEFAULT_AMAP_KEY;
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE || DEFAULT_AMAP_SECURITY_CODE;
  window._AMapSecurityConfig = { securityJsCode };
  amapPromise = new Promise((resolve, reject) => {
    const callback = `__nanyeeAmapReady${Date.now()}`;
    window[callback] = () => {
      delete window[callback];
      resolve(window.AMap);
    };
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Geocoder&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      delete window[callback];
      amapPromise = undefined;
      reject(new Error("地图加载失败"));
    };
    document.head.appendChild(script);
  });
  return amapPromise;
}

function rounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : null;
}

export default function AmapLocationPicker({ value, onChange }) {
  const canvasRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("点击地图选点，也可以搜索地址或使用当前设备定位。");
  const [available, setAvailable] = useState(true);

  onChangeRef.current = onChange;
  valueRef.current = value;

  const placeMarker = (lat, lng) => {
    const AMap = window.AMap;
    if (!AMap || !mapRef.current) return;
    const position = new AMap.LngLat(lng, lat);
    if (!markerRef.current) {
      markerRef.current = new AMap.Marker({ position });
      mapRef.current.add(markerRef.current);
    } else {
      markerRef.current.setPosition(position);
    }
  };

  const selectPoint = (latValue, lngValue, address = "") => {
    const lat = rounded(latValue);
    const lng = rounded(lngValue);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setStatus("经纬度无效，请重新选择。");
      return;
    }
    placeMarker(lat, lng);
    mapRef.current?.setZoomAndCenter(16, [lng, lat]);
    onChangeRef.current({ lat, lng, address: address || valueRef.current.address || "" });
    if (!geocoderRef.current) {
      setStatus("坐标已更新，请手动填写地点名称。");
      return;
    }
    setStatus("正在获取地点名称…");
    geocoderRef.current.getAddress([lng, lat], (resultStatus, result) => {
      const formatted = resultStatus === "complete" ? result?.regeocode?.formattedAddress : "";
      if (formatted) onChangeRef.current({ lat, lng, address: formatted });
      setStatus(formatted ? "位置已更新。" : "坐标已更新，请手动填写地点名称。");
    });
  };

  useEffect(() => {
    let disposed = false;
    loadAmap()
      .then((AMap) => {
        if (disposed || !canvasRef.current) return;
        const hasPoint = Number.isFinite(Number(valueRef.current.lat)) && Number.isFinite(Number(valueRef.current.lng));
        mapRef.current = new AMap.Map(canvasRef.current, {
          viewMode: "2D",
          zoom: hasPoint ? 16 : 13,
          center: hasPoint ? [Number(valueRef.current.lng), Number(valueRef.current.lat)] : DEFAULT_CENTER,
        });
        geocoderRef.current = new AMap.Geocoder();
        mapRef.current.on("click", (event) => selectPoint(event.lnglat.getLat(), event.lnglat.getLng()));
        if (hasPoint) placeMarker(Number(valueRef.current.lat), Number(valueRef.current.lng));
      })
      .catch(() => {
        if (!disposed) {
          setAvailable(false);
          setStatus("地图暂时无法加载，仍可手动输入经纬度。");
        }
      });
    return () => {
      disposed = true;
      markerRef.current = null;
      geocoderRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  const search = () => {
    const keyword = query.trim();
    if (!keyword || !geocoderRef.current) return;
    setStatus("正在搜索地址…");
    geocoderRef.current.getLocation(keyword, (resultStatus, result) => {
      const first = resultStatus === "complete" ? result?.geocodes?.[0] : null;
      if (!first?.location) {
        setStatus("没有找到该地址，请换个关键词或直接点地图。");
        return;
      }
      selectPoint(first.location.lat, first.location.lng, first.formattedAddress || keyword);
    });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setStatus("当前浏览器不支持定位，请点击地图或手动输入。");
      return;
    }
    setStatus("正在读取设备定位…");
    navigator.geolocation.getCurrentPosition(
      (position) => selectPoint(position.coords.latitude, position.coords.longitude),
      (error) => setStatus(error.message || "定位失败，请点击地图选择。"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const updateManual = (field, raw) => {
    if (field === "address") {
      onChange({ ...value, address: raw });
      return;
    }
    const next = raw === "" ? "" : Number(raw);
    onChange({ ...value, [field]: next });
    if (next !== "" && Number.isFinite(next) && value[field === "lat" ? "lng" : "lat"] !== "") {
      const lat = field === "lat" ? next : value.lat;
      const lng = field === "lng" ? next : value.lng;
      placeMarker(Number(lat), Number(lng));
    }
  };

  return (
    <div className="flex flex-col gap-3" data-component="AmapLocationPicker">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索地点，如南方医科大学顺德校区" onKeyDown={(event) => { if (event.key === "Enter") search(); }} />
        <Button type="button" variant="outline" onClick={search} disabled={!available || !query.trim()}><Search className="w-4 h-4" /> 搜索</Button>
        <Button type="button" variant="outline" onClick={locate}><LocateFixed className="w-4 h-4" /> 当前定位</Button>
      </div>
      <div ref={canvasRef} className="h-72 w-full overflow-hidden rounded-[var(--radius)] border border-border bg-[var(--seed-surface-2)]" aria-label="点击地图选择打卡位置" />
      <div className="text-[12px] text-[var(--muted)] flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {status}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>纬度</Label><Input type="number" step="any" value={value.lat} onChange={(event) => updateManual("lat", event.target.value)} placeholder="22.805618" /></div>
        <div><Label>经度</Label><Input type="number" step="any" value={value.lng} onChange={(event) => updateManual("lng", event.target.value)} placeholder="113.287350" /></div>
      </div>
      <div><Label>地点名称</Label><Input value={value.address} onChange={(event) => updateManual("address", event.target.value)} placeholder="教学楼、宿舍或其他地点说明" /></div>
    </div>
  );
}
