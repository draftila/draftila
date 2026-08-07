import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fontsService from '../../fonts/fonts.service';
import { defineTool } from './schemas';

export function registerFontTools(server: McpServer, _getUserId: () => string) {
  defineTool(
    server,
    'list_fonts',
    'List the custom font families an admin has uploaded to this instance, with the weights and styles each one actually ships. Use the exact "name" as fontFamily. Weights that a family does not ship snap to the nearest one it does. This lists custom families only — around 277 built-in Google families (Inter, Roboto, Poppins, Montserrat, ...) are also usable in fontFamily by their exact name and are not returned here, so an empty result does not mean there are no fonts. Custom fonts cannot be uploaded over MCP; that is an admin action in the web app.',
    {},
    async () => {
      const families = await fontsService.listFamilies();
      // Trimmed to what an agent can act on — ids, file URLs, sizes and
      // timestamps are noise it cannot use and pays for on every call.
      const data = families.map((family) => ({
        name: family.name,
        variants: family.variants.map((variant) => ({
          weight: variant.weight,
          style: variant.style,
        })),
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ families: data }) }] };
    },
  );
}
