import json
import hashlib
import math
import os
import re
import tempfile
import unicodedata
from collections import defaultdict
from openpyxl import load_workbook

INPUT_FILE = "input.xlsx"
OUTPUT_DIR = "output"
STEP = 0.125  # 기존 KDN MAP 타일 크기
MAX_JSON_BYTES = 24_500_000  # 실제 UTF-8 파일 크기: 24.5MB, 25MB보다 작게 유지
REINFORCEMENT_PRIORITY = {
    "계기교체(1순위)": 1,
    "계기교체(2순위)": 2,
    "계기교체(3순위)": 3,
}

# 모든 JSON은 output 한 폴더에 생성합니다.
# 보강공사는 기존 파일명을 유지하고 저압/고압은 접두사로 충돌을 방지합니다.
SHEET_CONFIG = {
    "보강공사": {"output_dir": OUTPUT_DIR, "work_type": "reinforcement", "prefix": "", "include_extra": False},
    "저압": {"output_dir": OUTPUT_DIR, "work_type": "low_voltage", "prefix": "low_", "include_extra": True},
    "고압": {"output_dir": OUTPUT_DIR, "work_type": "high_voltage", "prefix": "high_", "include_extra": True},
    "보강공사_중계표": {"output_dir": OUTPUT_DIR, "work_type": "relay_table", "prefix": "relay_", "include_extra": True},
}

BASE_REQUIRED_COLS = [
    "지사", "계약번호", "공동주택명", "상호명", "비고", "현재상태", "계기번호",
    "변대전산화", "변대주명"
]

EXTRA_COLS = [
    "신청자", "신청자연락처", "고객명", "고객연락처_1", "고객연락처_2",
    "검침원", "검침원연락처", "요청사항", "모뎀맥"
]


def excel_display_string(cell):
    """엑셀 셀을 화면에 보이는 형태에 가깝게 문자열로 변환합니다."""
    if cell is None:
        return ""

    value = cell.value
    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, (int, float)):
        number_format = str(cell.number_format or "")

        if isinstance(value, float) and value.is_integer():
            value = int(value)

        fmt_digits = "".join(ch for ch in number_format if ch == "0")
        if fmt_digits and all(ch in "0#.,-" for ch in number_format.replace('"', "")):
            try:
                as_int = int(round(float(value)))
                width = len(fmt_digits)
                return str(as_int).zfill(width)
            except Exception:
                pass

        if isinstance(value, int):
            return str(value)

        if isinstance(value, float):
            if value.is_integer():
                return str(int(value))
            return str(value)

    return str(value).strip()


def normalize_status(raw, work_type):
    s = str(raw or "").strip()
    if not s:
        return ""

    compact = re.sub(r"\s+", "", s)

    if work_type == "high_voltage":
        mapping = {status: status for status in (
            "점검", "험로", "긴급", "초긴급", "모뎀설치", "작업불가", "재방문"
        )}
        return mapping.get(compact, s)

    if work_type == "reinforcement":
        mapping = {
            "긴급": "긴급",
            "계기교체(1순위)": "계기교체(1순위)",
            "계기교체1순위": "계기교체(1순위)",
            "계기교체_1순위": "계기교체(1순위)",
            "계기교체(2순위)": "계기교체(2순위)",
            "계기교체2순위": "계기교체(2순위)",
            "계기교체_2순위": "계기교체(2순위)",
            "계기교체(3순위)": "계기교체(3순위)",
            "계기교체3순위": "계기교체(3순위)",
            "계기교체_3순위": "계기교체(3순위)",
            "1순위": "계기교체(1순위)",
            "2순위": "계기교체(2순위)",
            "3순위": "계기교체(3순위)",
            "모뎀설치": "모뎀설치",
            "작업불가": "작업불가",
            "재방문": "재방문",
            "미설치": "미설치",
        }
        return mapping.get(compact, s)

    # 저압/중계표 작업 구분과 공통 작업 처리 결과
    mapping = {
        "MKAMI": "MKAMI",
        "PPA": "사전협의" if work_type == "low_voltage" else "PPA",
        "기타": "기타",
        "긴급": "긴급",
        "점검": "점검",
        "험로": "험로",
        "모뎀설치": "모뎀설치",
        "작업불가": "작업불가",
        "재방문": "재방문",
    }
    if work_type == "low_voltage":
        mapping["사전협의"] = "사전협의"
    return mapping.get(compact.upper(), s)


def get_header_map(ws):
    header_cells = next(ws.iter_rows(min_row=1, max_row=1))
    headers = [cell.value for cell in header_cells]
    header_map = {}

    for i, h in enumerate(headers):
        if h is None:
            continue
        header_map[str(h).strip()] = i

    # 추가 열 위치에 의존하지 않으며 띄어쓰기/줄바꿈이 다른 제목도 인식합니다.
    for name, index in list(header_map.items()):
        compact = re.sub(r"\s+", "", name)
        if compact == "고객연락여부":
            header_map["고객연락 여부"] = index
        elif compact == "작업할당":
            header_map["작업할당"] = index

    return headers, header_map


def priority_meter_key(meter_no):
    # 계기번호는 숫자로 바꾸지 않아 앞자리 0을 보존합니다.
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", str(meter_no or "")))


def filter_reinforcement_priority_rows(groups, winners):
    """1~3순위만 시트 전체 계기번호별 한 행으로 제한하고 원래 저장 키는 보존합니다."""
    result = []
    removed = 0
    for group in groups:
        kept = []
        for row in group["rows"]:
            meter = priority_meter_key(row["m"])
            rank = REINFORCEMENT_PRIORITY.get(row["k"])
            if meter and rank is not None and winners[meter][1] is not row:
                removed += 1
                continue
            kept.append(row)
        if not kept:
            continue
        group["rows"] = kept
        # 제거된 행에만 있던 지사/좌표가 지사 범위와 마커 수에 남지 않도록 갱신합니다.
        branches = list(dict.fromkeys(row["branch"] for row in kept if row["branch"]))
        group["branch"] = branches[0] if branches else ""
        group["branches"] = branches
        result.append(group)
    return result, removed


def find_coordinate_columns(headers):
    """명시된 계기 위도/위도를 우선 사용합니다. 빈 새 좌표를 인입주 좌표로 대체하지 않습니다."""
    names = [re.sub(r"\s+", "", str(h or "")) for h in headers]
    for latitude_name in ("계기위도", "위도", "인입주좌표"):
        if latitude_name not in names:
            continue
        lat = names.index(latitude_name)
        if lat + 1 < len(names) and names[lat + 1] in ("경도", "계기경도"):
            return lat, lat + 1, latitude_name
        if latitude_name == "인입주좌표" and lat + 1 < len(names) and not names[lat + 1]:
            # 기존 병합 제목: 1행 인입주좌표, 2행 위도/경도.
            return lat, lat + 1, latitude_name
        longitude_name = "계기경도" if "계기경도" in names else "경도"
        candidates = [i for i, name in enumerate(names) if name == longitude_name]
        if len(candidates) == 1:
            return lat, candidates[0], latitude_name
        raise ValueError(f"{latitude_name} 열에 대응하는 경도 열을 확인하세요. 위도·경도를 나란히 배치해 주세요.")
    raise ValueError("위도/경도 또는 계기위도/계기경도 열이 필요합니다. 기존 인입주좌표/경도 제목도 지원합니다.")


def find_road_col(header_map):
    for name in ["도로명주소", "도로명 주소", "주소(도로명)", "도로명"]:
        if name in header_map:
            return name
    return None


def get_cell(row, header_map, name):
    idx = header_map.get(name)
    if idx is None:
        return None
    return row[idx] if idx < len(row) else None


def get_float(cell):
    if cell is None or cell.value is None or str(cell.value).strip() == "":
        return None
    try:
        value = float(cell.value)
        return value if math.isfinite(value) else None
    except Exception:
        return None


def build_group_key(inflow_no, meter_no, contract_no, row_number):
    """
    기존 Firebase 저장 키와 연결할 때만 사용하는 원래 그룹 번호입니다.
    지도 마커는 이 번호가 아니라 좌표로 묶습니다.
    """
    if inflow_no:
        return inflow_no
    if meter_no:
        return f"METER:{meter_no}"
    if contract_no:
        return f"CONTRACT:{contract_no}"
    return f"ROW:{row_number}"


def build_coordinate_group_key(work_type, lat, lng):
    # 같은 작업 시트에서 같은 좌표는 지사와 관계없이 하나의 마커로 묶습니다.
    # 좌표를 반올림하거나 격자로 합치지 않습니다.
    identity = json.dumps([work_type, lat, lng], ensure_ascii=False, separators=(",", ":"))
    return "COORD:" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]


def normalize_address_group_key(address, road_address=""):
    """주소의 번지까지 남기고 동·호수·상호명 같은 뒤쪽 정보를 제거합니다."""
    candidates = [address, road_address]
    fallback = ""

    for raw in candidates:
        text = unicodedata.normalize("NFKC", str(raw or ""))
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        if not fallback:
            fallback = text

        # 주소 앞에 붙는 우편번호가 있으면 주소 판단에서 제외합니다.
        text = re.sub(r"^\s*(?:\[\d{5}\]|\(\d{5}\)|\d{5})\s*", "", text)
        match = re.search(r"(?:^|\s)(?:산\s*)?\d+(?:-\d*)?(?:번지)?(?=$|\s)", text)
        if match:
            base = text[:match.end()].strip()
            base = re.sub(r"번지$", "", base)
            base = re.sub(r"-$", "", base)
            return re.sub(r"\s+", "", base)

    return re.sub(r"\s+", "", fallback)


def remove_old_json_files(output_dir):
    """이전 변환에서 남은 타일 JSON이 새 결과와 섞이지 않도록 해당 출력 폴더의 JSON만 정리합니다."""
    if not os.path.isdir(output_dir):
        return

    for name in os.listdir(output_dir):
        if name == "tiles_index.json" or name == "branches.json" or (
            name.startswith("tile_") and name.endswith(".json")
        ):
            try:
                os.remove(os.path.join(output_dir, name))
            except OSError:
                pass


def encode_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def write_json_file(path, value):
    data = encode_json(value)
    if len(data) > MAX_JSON_BYTES:
        raise ValueError(f"{os.path.basename(path)} 파일이 24.5MB를 초과합니다. 파일은 저장하지 않았습니다.")
    with open(path, "wb") as stream:
        stream.write(data)


def iter_group_payloads(group, max_bytes):
    """일반 마커는 통째로 보존하고, 단독으로도 큰 마커만 계기 경계에서 분할합니다."""
    payload = encode_json(group)
    object_limit = max_bytes - 2  # 파일 배열의 대괄호까지 포함
    if len(payload) <= object_limit:
        yield payload, len(group["rows"])
        return
    del payload

    # 각 조각에 원래 행 위치를 남겨, 지도에서 한 마커와 원래 계기 순서로 복원합니다.
    metadata = {key: value for key, value in group.items() if key != "rows"}
    row_total = len(group["rows"])
    start = 0

    def prefix(offset):
        return encode_json(dict(metadata, rowOffset=offset, rowTotal=row_total))[:-1] + b',"rows":['

    head = prefix(start)
    rows = []
    size = len(head) + 2  # ]}
    for row in group["rows"]:
        encoded = encode_json(row)
        extra = len(encoded) + (1 if rows else 0)
        if rows and size + extra > object_limit:
            yield head + b",".join(rows) + b"]}", len(rows)
            start += len(rows)
            head = prefix(start)
            rows = []
            size = len(head) + 2
            extra = len(encoded)
        if size + extra > object_limit:
            meter = str(row.get("m") or "번호 없음")
            raise ValueError(f"계기 {meter} 한 행의 내용만으로 파일 제한을 초과합니다. 지나치게 긴 셀 내용을 확인하세요.")
        rows.append(encoded)
        size += extra
    if rows:
        yield head + b",".join(rows) + b"]}", len(rows)


def write_packed_tiles(groups_list, output_dir, prefix, max_bytes=MAX_JSON_BYTES):
    """가까운 지역부터 채워 시트별 JSON 개수를 줄이고 실제 바이트 상한을 지킵니다."""
    if not isinstance(max_bytes, int) or not 2 < max_bytes <= MAX_JSON_BYTES:
        raise ValueError("JSON 최대 크기는 24,500,000바이트 이하여야 합니다.")
    ordered = sorted(groups_list, key=lambda group: (
        math.floor(group["y"] / STEP), math.floor(group["x"] / STEP),
        group["y"], group["x"], group["n"]
    ))
    os.makedirs(output_dir, exist_ok=True)
    index = []
    payloads = []
    size = 2
    row_count = 0
    bounds = None

    def flush():
        nonlocal payloads, size, row_count, bounds
        if not payloads:
            return
        name = f"{prefix}tile_part_{len(index) + 1:04d}.json"
        with open(os.path.join(output_dir, name), "wb") as stream:
            stream.write(b"[")
            for i, payload in enumerate(payloads):
                if i:
                    stream.write(b",")
                stream.write(payload)
            stream.write(b"]")
        index.append({
            "id": name[:-5], "file": name, **bounds,
            "count": len(payloads), "rows": row_count, "sizeBytes": size
        })
        payloads = []
        size = 2
        row_count = 0
        bounds = None

    for group in ordered:
        for payload, rows in iter_group_payloads(group, max_bytes):
            added = len(payload) + (1 if payloads else 0)
            if payloads and size + added > max_bytes:
                flush()
                added = len(payload)
            payloads.append(payload)
            size += added
            row_count += rows
            lat, lng = group["y"], group["x"]
            if bounds is None:
                bounds = {"minLat": lat, "maxLat": lat, "minLng": lng, "maxLng": lng}
            else:
                bounds["minLat"] = min(bounds["minLat"], lat)
                bounds["maxLat"] = max(bounds["maxLat"], lat)
                bounds["minLng"] = min(bounds["minLng"], lng)
                bounds["maxLng"] = max(bounds["maxLng"], lng)
    flush()
    return index


def is_map_json_file(name):
    return any(
        name in {f"{prefix}tiles_index.json", f"{prefix}branches.json"}
        or (name.startswith(f"{prefix}tile_") and name.endswith(".json"))
        for prefix in ("", "low_", "high_", "relay_")
    )


def install_generated_json(staging_dir, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    new_names = {name for name in os.listdir(staging_dir) if is_map_json_file(name)}
    # 데이터 파일을 먼저 교체하고 파일목록을 마지막에 교체합니다.
    for name in sorted(new_names, key=lambda name: name.endswith("tiles_index.json")):
        os.replace(os.path.join(staging_dir, name), os.path.join(output_dir, name))
    for name in os.listdir(output_dir):
        if is_map_json_file(name) and name not in new_names:
            os.remove(os.path.join(output_dir, name))


def convert_sheet(ws, sheet_name, config):
    output_dir = config["output_dir"]
    work_type = config["work_type"]
    include_extra = config["include_extra"]
    prefix = config.get("prefix", "")

    headers, header_map = get_header_map(ws)
    road_col_name = find_road_col(header_map)
    lat_col, lng_col, coordinate_source = find_coordinate_columns(headers)
    address_col_name = "지번주소" if "지번주소" in header_map else "주소"

    missing = [c for c in BASE_REQUIRED_COLS if c not in header_map]
    if include_extra:
        extra_columns = (["계약전력", "용도"] + EXTRA_COLS[2:]
                         if work_type == "high_voltage" else EXTRA_COLS)
        missing += [c for c in extra_columns if c not in header_map]
    if address_col_name not in header_map and not road_col_name:
        missing.append("지번주소/주소/도로명주소 중 하나")

    if missing:
        raise ValueError(f"[{sheet_name}] 시트에 필요한 열이 없습니다: {missing}")

    groups = {}
    skipped_no_coord = 0
    skipped_no_id = 0
    valid_rows = 0
    legacy_row_counts = defaultdict(int)
    priority_winners = {}

    for row_number, row in enumerate(ws.iter_rows(min_row=2), start=2):
        lat = get_float(row[lat_col] if lat_col < len(row) else None)
        lng = get_float(row[lng_col] if lng_col < len(row) else None)
        if lat is None or lng is None or lat == 0 or lng == 0 or not (-90 <= lat <= 90 and -180 <= lng <= 180):
            skipped_no_coord += 1
            continue

        inflow_no = excel_display_string(get_cell(row, header_map, "인입주번호"))
        inflow_name = excel_display_string(get_cell(row, header_map, "인입주명"))
        branch = excel_display_string(get_cell(row, header_map, "지사"))
        contract_no = excel_display_string(get_cell(row, header_map, "계약번호"))
        meter_no = excel_display_string(get_cell(row, header_map, "계기번호"))

        legacy_group = build_group_key(inflow_no, meter_no, contract_no, row_number)
        legacy_index = legacy_row_counts[legacy_group]
        legacy_row_counts[legacy_group] += 1
        group_key = build_coordinate_group_key(work_type, lat, lng)

        transformer_code = excel_display_string(get_cell(row, header_map, "변대전산화"))
        transformer_name = excel_display_string(get_cell(row, header_map, "변대주명"))
        address = excel_display_string(get_cell(row, header_map, address_col_name))
        road_addr = (
            excel_display_string(get_cell(row, header_map, road_col_name))
            if road_col_name else ""
        )
        apartment = excel_display_string(get_cell(row, header_map, "공동주택명"))
        store = excel_display_string(get_cell(row, header_map, "상호명"))
        note = excel_display_string(get_cell(row, header_map, "비고"))
        status = normalize_status(
            excel_display_string(get_cell(row, header_map, "현재상태")),
            work_type
        )

        if group_key not in groups:
            group = {
                "n": group_key,
                "b": "",
                "grouping": "coordinate-v1",
                "branch": branch,
                "branches": [branch] if branch else [],
                "x": float(lng),
                "y": float(lat),
                "rows": []
            }

            # 신규 작업만 작업종류를 명시합니다.
            # 기존 보강공사 JSON 구조에는 필드를 추가하지 않아 기존 호환성을 유지합니다.
            if work_type != "reinforcement":
                group["workType"] = work_type

            groups[group_key] = group
        else:
            if branch and not groups[group_key].get("branch"):
                groups[group_key]["branch"] = branch
            if branch and branch not in groups[group_key].setdefault("branches", []):
                groups[group_key]["branches"].append(branch)

        address_group_key = normalize_address_group_key(address, road_addr)

        row_data = {
            "branch": branch,
            "statusGroupNo": legacy_group,
            "statusRowIndex": legacy_index,
            "inflowNo": inflow_no,
            "inflowName": inflow_name,
            "c": contract_no,
            "n2": transformer_code,
            "o": transformer_name,
            "f": address,
            "r": road_addr,
            "addressGroupKey": address_group_key,
            "h": apartment,
            "i": store,
            "j": note,
            "k": status,
            "m": meter_no
        }

        # 보강공사만: 엑셀의 실제 P열에 '3상'이 있으면 마커용 플래그만 추가합니다.
        # 기존 필드/표시/상태 로직은 변경하지 않습니다.
        if work_type == "reinforcement" and len(row) >= 16:
            p_value = excel_display_string(row[15])
            if "3상" in p_value:
                row_data["p3"] = True

        # 저압/고압 P~X열 상세정보
        if include_extra:
            row_data.update({
                "customerName": excel_display_string(get_cell(row, header_map, "고객명")),
                "customerPhone1": excel_display_string(get_cell(row, header_map, "고객연락처_1")),
                "customerPhone2": excel_display_string(get_cell(row, header_map, "고객연락처_2")),
                "meterReader": excel_display_string(get_cell(row, header_map, "검침원")),
                "meterReaderPhone": excel_display_string(get_cell(row, header_map, "검침원연락처")),
                "request": excel_display_string(get_cell(row, header_map, "요청사항")),
                "modemMac": excel_display_string(get_cell(row, header_map, "모뎀맥")),
            })

            if work_type == "high_voltage":
                row_data.update({
                    "contractPower": excel_display_string(get_cell(row, header_map, "계약전력")),
                    "purpose": excel_display_string(get_cell(row, header_map, "용도")),
                })
            else:
                row_data.update({
                    "applicant": excel_display_string(get_cell(row, header_map, "신청자")),
                    "applicantPhone": excel_display_string(get_cell(row, header_map, "신청자연락처")),
                })

        # 신규 열이 없는 기존 엑셀도 변환 가능합니다. 빈 값은 상세정보에서 '-'로 표시합니다.
        if work_type in ("low_voltage", "relay_table"):
            row_data["customerContactStatus"] = excel_display_string(
                get_cell(row, header_map, "고객연락 여부")
            )

        # 열 위치 대신 제목으로 읽습니다. 미할당/기존 파일의 누락 열은 공용 작업입니다.
        if work_type == "low_voltage":
            row_data["workAssignment"] = excel_display_string(
                get_cell(row, header_map, "작업할당")
            )

        groups[group_key]["rows"].append(row_data)
        valid_rows += 1

        if work_type == "reinforcement":
            meter_key = priority_meter_key(meter_no)
            rank = REINFORCEMENT_PRIORITY.get(status)
            if meter_key and rank is not None:
                previous = priority_winners.get(meter_key)
                # 같은 순위는 엑셀에서 먼저 나온 행을 유지합니다.
                if previous is None or rank < previous[0]:
                    priority_winners[meter_key] = (rank, row_data)

    groups_list = list(groups.values())
    removed_priority_duplicates = 0
    if work_type == "reinforcement":
        groups_list, removed_priority_duplicates = filter_reinforcement_priority_rows(
            groups_list, priority_winners
        )
        valid_rows -= removed_priority_duplicates

    # 지사별 지도 범위 생성
    branch_stats = defaultdict(lambda: {"lat": [], "lng": []})
    for g in groups_list:
        branches = g.get("branches") or ([g.get("branch")] if g.get("branch") else [])
        for branch_name in branches:
            if branch_name:
                branch_stats[branch_name]["lat"].append(g["y"])
                branch_stats[branch_name]["lng"].append(g["x"])

    branch_meta = []
    for name, vals in sorted(branch_stats.items()):
        lats = vals["lat"]
        lngs = vals["lng"]
        lats_sorted = sorted(lats)
        lngs_sorted = sorted(lngs)
        mid = len(lats_sorted) // 2

        branch_meta.append({
            "name": name,
            "lat": float(lats_sorted[mid]),
            "lng": float(lngs_sorted[mid]),
            "minLat": float(min(lats)),
            "maxLat": float(max(lats)),
            "minLng": float(min(lngs)),
            "maxLng": float(max(lngs)),
            "count": len(lats),
            "level": 7
        })

    tile_index = write_packed_tiles(groups_list, output_dir, prefix, config.get("max_json_bytes", MAX_JSON_BYTES))
    index_data = {
        "step": STEP, "layout": "packed-v1", "maxFileBytes": config.get("max_json_bytes", MAX_JSON_BYTES),
        "grouping": "coordinate-v1", "tiles": tile_index
    }
    if work_type != "reinforcement":
        index_data.update({"workType": work_type, "sheet": sheet_name})
    write_json_file(os.path.join(output_dir, f"{prefix}tiles_index.json"), index_data)
    write_json_file(os.path.join(output_dir, f"{prefix}branches.json"), branch_meta)

    return {
        "sheet": sheet_name,
        "output_dir": output_dir,
        "rows": valid_rows,
        "groups": len(groups_list),
        "tiles": len(tile_index),
        "skipped_no_coord": skipped_no_coord,
        "skipped_no_id": skipped_no_id,
        "coordinate_source": coordinate_source,
        "removed_priority_duplicates": removed_priority_duplicates,
    }


def main():
    if not os.path.exists(INPUT_FILE):
        raise FileNotFoundError(
            f"{INPUT_FILE} 파일이 없습니다. 엑셀 파일 이름을 input.xlsx 로 바꿔 "
            "converter.py와 같은 폴더에 넣어주세요."
        )

    wb = load_workbook(INPUT_FILE, data_only=True, read_only=True)

    missing_sheets = [name for name in SHEET_CONFIG if name not in wb.sheetnames]
    if missing_sheets:
        wb.close()
        raise ValueError(f"엑셀에 필요한 시트가 없습니다: {missing_sheets}")

    print("=" * 64)
    print("KDN MAP 4개 작업 변환 시작")
    print("보강공사 / 저압 / 고압 / 중계표")
    print("=" * 64)

    try:
        # 네 시트가 모두 변환되어야 기존 output을 갱신합니다.
        output_parent = os.path.dirname(os.path.abspath(OUTPUT_DIR))
        os.makedirs(output_parent, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="kdn_json_", dir=output_parent) as staging:
            for sheet_name, config in SHEET_CONFIG.items():
                print(f"\n[{sheet_name}] 변환 중...")
                result = convert_sheet(wb[sheet_name], sheet_name, dict(config, output_dir=staging))
                print(
                    f"  완료: 유효행 {result['rows']:,} / 마커그룹 {result['groups']:,} "
                    f"/ 데이터 파일 {result['tiles']:,}개 (파일당 최대 24.5MB)"
                )
                print(f"  좌표 열: {result['coordinate_source']} / 좌표 누락·오류 제외 {result['skipped_no_coord']:,}행")
                if config["work_type"] == "reinforcement":
                    print(f"  1~3순위 계기번호 중복 제외 {result['removed_priority_duplicates']:,}행 (긴급은 모두 유지)")
            install_generated_json(staging, OUTPUT_DIR)
    finally:
        wb.close()

    print("\n" + "=" * 64)
    print("전체 변환 완료")
    print("=" * 64)
    print("보강공사 : output/branches.json, tiles_index.json, tile_*.json")
    print("저압     : output/low_branches.json, low_tiles_index.json, low_tile_*.json")
    print("고압     : output/high_branches.json, high_tiles_index.json, high_tile_*.json")
    print("중계표   : output/relay_branches.json, relay_tiles_index.json, relay_tile_*.json")
    print("\n모든 JSON은 output 한 폴더에 생성됩니다.")
    print("- 데이터 파일은 시트별로 묶어 파일당 24,500,000바이트(24.5MB) 이하로 생성합니다.")
    print("- 각 시트의 마지막 데이터 파일과 파일목록·지사정보 JSON은 더 작을 수 있습니다.")
    print("- 같은 작업 시트의 동일 위도·경도는 마커 하나로 표시합니다. 인입주번호와 지사는 묶음 기준이 아닙니다.")
    print("- 지번주소·도로명주소·상호명 등 각 계기의 원본 정보와 기존 상태 저장 연결을 보존합니다.")
    print("- 저압/중계표 상세정보에 고객연락 여부 포함")
    print("- 저압 작업할당 포함: 작업자는 본인 이름과 빈칸인 계기만 표시")
    print("- 고압: 계약전력/용도, 저압/중계표: 신청자/신청자연락처 및 나머지 상세정보 포함")
    print("- 저압 작업 구분: MKAMI/사전협의/기타/긴급/점검/험로 (기존 PPA는 사전협의로 통합)")
    print("- 중계표 작업 구분: MKAMI/PPA/기타/긴급/점검/험로")
    print("- 고압 작업 구분: 점검/험로/긴급/초긴급")
    print("- 보강공사 1~3순위는 같은 계기번호 중 최우선 한 행만 표시하며 긴급은 중복도 모두 유지")
    print("- 모든 시트의 작업 처리 결과: 모뎀설치/작업불가/재방문")
    print("- 비고의 '3상' 값도 j 필드에 그대로 보존되어 향후 마커 숫자 3 표시에 사용 가능")


if __name__ == "__main__":
    main()
