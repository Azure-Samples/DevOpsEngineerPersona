# Translations

This directory contains translation files for the Zava Gift Exchange application.

## Structure

Each language has its own file:

- `en.ts` - English (source language)
- `es.ts` - Spanish (Español)
- `pt.ts` - Portuguese (Português)
- `fr.ts` - French (Français)
- `it.ts` - Italian (Italiano)
- `ja.ts` - Japanese (日本語)
- `ko.ts` - Korean (한국어)
- `zh.ts` - Chinese (中文)
- `de.ts` - German (Deutsch)
- `nl.ts` - Dutch (Nederlands)

The `index.ts` file aggregates all translations and exports them as a single object.

## Contributing Translations

### For Volunteers

If you'd like to contribute a translation or improve an existing one:

1. **Fork the repository** on GitHub
2. **Download the English file** (`en.ts`) as a reference
3. **Load the file into your CAT tool** (Computer-Assisted Translation tool) of choice:
   - SDL Trados
   - memoQ
   - Smartcat
   - OmegaT
   - Or any other CAT tool that supports TypeScript/JavaScript files
4. **Translate the strings** while keeping the keys (left side) unchanged
5. **Save the translated file** with the appropriate language code (e.g., `fr.ts` for French)
6. **Test your translation** (optional but recommended):
   ```bash
   npm install
   npm run build
   ```
7. **Submit a Pull Request** with your changes

### Translation Guidelines

- **Do NOT modify the keys** (e.g., `appName`, `welcome`, etc.) - only translate the values
- **Keep placeholders intact**: If you see `{eventName}` or `{count}`, keep them as-is in your translation
- **Maintain formatting**: If the English text has special characters like emoji or punctuation, consider if they're appropriate for your language
- **Context matters**: Some strings are button labels, others are longer descriptions. The context is usually clear from the key name
- **Be consistent**: Use the same terminology throughout the translation

### Example

```typescript
// ✅ Correct
export const fr = {
  welcome: "Bienvenue!",
  welcomeDesc: "Organisez votre échange de cadeaux facilement et amusant",
  // ...
}

// ❌ Incorrect (don't change the keys!)
export const fr = {
  bienvenue: "Bienvenue!",
  descriptionBienvenue: "Organisez votre échange de cadeaux facilement et amusant",
  // ...
}
```

### Adding a New Language

If you want to add a completely new language:

1. **Copy `en.ts`** to a new file with the appropriate language code (e.g., `ru.ts` for Russian)
2. **Translate all strings** in the new file
3. **Update `index.ts`** to import and export your new language:
   ```typescript
   import { ru } from './ru'
   
   export const translations = {
     // ... existing languages
     ru,
   }
   ```
4. **Update `/src/lib/types.ts`** to add the language code to the `Language` type and `LANGUAGES` array
5. **Submit a Pull Request**

## File Format

Each translation file exports a single constant object with all the translation keys and values:

```typescript
export const en = {
  appName: "Zava Gift Exchange",
  welcome: "Welcome!",
  // ... more translations
}
```

## Questions?

If you have questions about translations or need clarification on any strings, please:
- Open an issue on GitHub
- Reach out to the maintainers
- Check existing translations in other languages for context

Thank you for helping make Zava Gift Exchange accessible to more people! 🎅🎁
