#!/bin/bash
# Stress test runner for payroll mapping
# Tests: CSV parsing behavior + AI mapping agent

BASE="http://localhost:3000"
DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
WARN=0

echo "======================================"
echo " Payroll Mapping Stress Tests"
echo "======================================"
echo ""

run_mapping_test() {
  local label="$1"
  local columns_json="$2"
  local expect_null="$3"   # comma-separated source columns expected to map to null

  echo "--- $label ---"
  RESPONSE=$(curl -s -X POST "$BASE/api/payroll/suggest-mapping" \
    -H "Content-Type: application/json" \
    -d "{\"columns\": $columns_json, \"runId\": \"test-run-id\"}")

  if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'  {m[\"source_column\"]:45} -> {str(m[\"suggested_target\"]):25} [{m[\"confidence\"]}]' + (' *** AMBIGUOUS' if m.get('ambiguous') else '')) for m in d['mappings']]" 2>/dev/null; then
    PASS=$((PASS+1))
    # Check if required fields got mapped
    NULLS=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(m['source_column']) for m in d['mappings'] if m['suggested_target'] is None]" 2>/dev/null)
    if [ -n "$NULLS" ]; then
      echo "  [UNMAPPED columns]: $NULLS"
    fi
    # Check coverage of key fields
    MAPPED=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); targets=[m['suggested_target'] for m in d['mappings'] if m['suggested_target']]; required=['employee_id','gross_wages','pretax_contribution','pay_date']; missing=[r for r in required if r not in targets]; print('MISSING_REQUIRED:' + ','.join(missing)) if missing else print('ALL_REQUIRED_MAPPED')" 2>/dev/null)
    echo "  Coverage: $MAPPED"
  else
    echo "  ERROR: $RESPONSE"
    FAIL=$((FAIL+1))
  fi
  echo ""
}

parse_csv_headers() {
  local file="$1"
  python3 -c "
import sys
with open('$file') as f:
    first_line = f.readline().strip()
headers = [h.strip().strip('\"') for h in first_line.split(',')]
import json
print(json.dumps(headers))
"
}

# ── TEST 1: No headers (data values become "headers") ──────────────
echo "[TEST 1] No headers — raw data in first row"
COLS=$(parse_csv_headers "$DIR/01_no_headers.csv")
echo "  Parser sees these as headers: $COLS"
run_mapping_test "Test 1: No headers" "$COLS"

# ── TEST 2: Wrong column order ──────────────────────────────────────
echo "[TEST 2] Wrong column order"
COLS=$(parse_csv_headers "$DIR/02_wrong_column_order.csv")
run_mapping_test "Test 2: Wrong column order" "$COLS"

# ── TEST 3: Abbreviated headers ─────────────────────────────────────
echo "[TEST 3] Abbreviated headers (ID, FN, LN, GW...)"
COLS=$(parse_csv_headers "$DIR/03_abbreviated_headers.csv")
run_mapping_test "Test 3: Abbreviated headers" "$COLS"

# ── TEST 4: Verbose/long headers ─────────────────────────────────────
echo "[TEST 4] Verbose/long headers"
COLS=$(parse_csv_headers "$DIR/04_verbose_headers.csv")
run_mapping_test "Test 4: Verbose headers" "$COLS"

# ── TEST 5: Misspelled headers ───────────────────────────────────────
echo "[TEST 5] Misspelled headers"
COLS=$(parse_csv_headers "$DIR/05_misspelled_headers.csv")
run_mapping_test "Test 5: Misspelled headers" "$COLS"

# ── TEST 6: Ambiguous/generic headers ────────────────────────────────
echo "[TEST 6] Ambiguous headers (Amount1, Amount2...)"
COLS=$(parse_csv_headers "$DIR/06_ambiguous_headers.csv")
run_mapping_test "Test 6: Ambiguous headers" "$COLS"

# ── TEST 7: Headers only, no data rows ───────────────────────────────
echo "[TEST 7] Headers only (empty CSV)"
COLS=$(parse_csv_headers "$DIR/07_headers_only.csv")
run_mapping_test "Test 7: Headers only" "$COLS"

# ── TEST 8: Mixed case headers ───────────────────────────────────────
echo "[TEST 8] Mixed case headers"
COLS=$(parse_csv_headers "$DIR/08_mixed_case_headers.csv")
run_mapping_test "Test 8: Mixed case" "$COLS"

# ── TEST 9: Extra unknown columns ────────────────────────────────────
echo "[TEST 9] Extra/unknown columns (Department, Cost Center, Manager...)"
COLS=$(parse_csv_headers "$DIR/09_extra_unknown_columns.csv")
run_mapping_test "Test 9: Extra unknown columns" "$COLS"

# ── TEST 10: Missing required columns ────────────────────────────────
echo "[TEST 10] Missing required columns (no employee_id, no Roth, no loan)"
COLS=$(parse_csv_headers "$DIR/10_missing_required_columns.csv")
run_mapping_test "Test 10: Missing required columns" "$COLS"

# ── SUMMARY ──────────────────────────────────────────────────────────
echo "======================================"
echo " Results: $PASS passed · $FAIL failed"
echo "======================================"
