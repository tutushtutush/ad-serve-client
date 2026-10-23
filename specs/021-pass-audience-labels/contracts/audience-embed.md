# Contract: telling the SDK the viewer's audience labels

```js
// before the SDK has loaded: queue it (safe at any time)
window.adServe = window.adServe || { q: [] };
window.adServe.q.push(["setAudience", ["follows-team-x", "age-25-34"]]);
// once the SDK has started
window.adServe.setAudience(["follows-team-x", "age-25-34"]);
// withdraw (sign-out, consent withdrawn)
window.adServe.setAudience(null);   // or []
```

| Call | Effect |
|---|---|
| a list of strings | replaces the labels; cleaned (trim, lowercase, pattern, 1 to 40 characters, repeats once, first 20) |
| `null` or `[]` | clears the labels |
| a string, number, object, no argument, several arguments | nothing changes; one console warning |
| a list with entries, none usable | clears the labels; one console warning |

Queued entries are applied before the first ad requests of the page; the last valid one wins. A call applies to requests made after it. Labels are kept in memory for the page view only (call it on every page), are never stored, and are not sent on click or viewable-impression reports. The SDK does not read consent signals: only call it for visitors your privacy rules allow. Labels must not identify a person.
