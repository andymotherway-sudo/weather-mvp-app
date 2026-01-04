# OMNI wx – Alpha Acceptance Criteria

The Private Alpha is acceptable only if **all** criteria below are met.

---

## Map & Radar
- [ ] Map loads reliably on app launch
- [ ] Radar renders without persistent blur or jitter
- [ ] Time navigation works (scrubber or step)
- [ ] Map camera does not reset unexpectedly
- [ ] Location behavior is predictable (device or manual fallback)

## Nautical
- [ ] Marine lens shows both polygons and buoy pins
- [ ] Buoy tap selects correct buoy
- [ ] Polygon tap selects correct zone
- [ ] Buoy detail screen shows correct data
- [ ] NOAA attribution and timestamps visible

## Land Weather
- [ ] Daily forecast loads without error
- [ ] Dew point always visible
- [ ] Wind and gusts visible
- [ ] Source attribution visible
- [ ] Graceful handling of missing data

## Performance & Stability
- [ ] No crashes during normal navigation
- [ ] No infinite fetch/render loops
- [ ] Acceptable performance on mid-range devices

## Quality Gates
- [ ] CI passes on main
- [ ] Lint produces no errors
- [ ] Typecheck passes
- [ ] Requirements and decisions docs reflect current behavior

## Alpha Exit Decision
Alpha is considered successful when:
- [ ] 3–5 users can use the app daily
- [ ] Feedback is about features, not breakage
- [ ] Radar and Map are trusted and understandable
