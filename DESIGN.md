# Space Atlas

My C.AI Universe is a character-writing workspace. Discover puts the cast within reach of the opening scene. Active conversations prioritize the transcript and composer. The default theme keeps its persisted key `higgsfield`. Alternate themes retain their own tokens.

## Visual system

| Role | Default |
| --- | --- |
| Canvas and reading surface | Ink blue `#0a101b` and `#111b29` |
| Text and actions | Warm ivory `#f4efe4` and violet `#c8b5ef` |
| Type | Manrope for controls, Newsreader for editorial headings, JetBrains Mono for metadata |
| Accretion disk | Asymmetric amber-white emission around a dark central shadow |

Discover pairs the search and portrait shelf with a guest entry point and an authenticated link to the latest conversation. Filtering moves the artwork out of the way. Scene Spark opens an editable draft. The shelf supports swipe, arrow keys, Home and End.

## Runtime and states

The black hole casts a steady shadow. Bright gas streams across its foreground disk and along the lensed arcs above and below it. A separate spiral galaxy turns beside it. The reference for the disk geometry is figure 16 in the [Interstellar rendering paper](https://arxiv.org/pdf/1502.03808#page=28).

Discover plays the scene automatically whenever it is visible, including under reduced motion. The CSS fallback animates light around the captured shadow when WebGL is unavailable or slow. The renderer suspends work offscreen and in hidden tabs. Other interface motion follows the OS preference. Use placeholders shaped like the eventual portrait, conversation, saved row or editor. Keep a user's text during failed operations and provide a retry at the failed region.

The shared Atlas styles, Orbit motion and both canvas scripts have mirrored Express and Next copies. Verify byte parity and run navigation and renderer tests. Check the real page with motion enabled and disabled.

## Multi-agent implementation workflow

Use the [GitHub tracking issue](https://github.com/Kazuken123/My-C.AI-Universe/issues/2) for dependencies and acceptance. Work from the same design and fixture data on both clients.

| Owner | Code and handoff |
| --- | --- |
| Integration | Shared shell, tokens, motion policy, Studio, personas and account. Registers route styles and runs the final cross-client checks. |
| Graphics | Renderer, posters, scene stylesheet and fixed-camera lens-on/off proof. Hands off focal placement and fallback selectors to Discover. |
| Discover | Hero, roster, search, session resume and portrait loading states. Owns both route implementations and the Discover stylesheet. |
| Conversations | Reader, saved sessions, composer, drawers and route-specific skeletons. Owns both route implementations and the chat stylesheet. |

1. Capture the guest and signed-in flows with controlled characters and two saved scenes for the same character. Assign one writer to each shared asset.
2. Agree on selectors, focal positions and session-link contracts. Implement separate journeys concurrently. Run the relevant route checks before handoff.
3. Review desktop and mobile stills plus keyboard and retry behavior in a browser. Use a fixed camera and sky for lens comparisons. Record the renderer and device with performance measurements.
4. Integrate each route with its companion client and run the root and Next checks. Review any theme-specific or authenticated limitation explicitly.

The earlier [Orbit concept](docs/design/orbit-stitch-preview.jpg) is retained as a historical visual reference. The browser implementation is the current design handoff.
