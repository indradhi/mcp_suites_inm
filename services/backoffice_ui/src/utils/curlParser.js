/**
 * Utility to parse cURL command strings into structured API configuration
 * for MCP Tool & Knowledge Base ingestion.
 */

export function parseCurl(curlText) {
  if (!curlText || typeof curlText !== 'string' || !curlText.trim()) {
    return { success: false, error: 'Teks cURL tidak boleh kosong.' };
  }

  try {
    // 1. Clean line continuations (\ at end of bash lines or ^ at end of cmd lines)
    let cleanText = curlText
      .replace(/\\\r?\n/g, ' ')
      .replace(/\^\r?\n/g, ' ')
      .replace(/\r?\n/g, ' ')
      .trim();

    // Remove leading 'curl' or 'curl.exe' keyword if present
    cleanText = cleanText.replace(/^(?:curl(?:\.exe)?\s+)/i, '');

    // 2. Tokenize string while strictly respecting quotes
    const tokens = [];
    let currentToken = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let isEscaped = false;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];

      if (isEscaped) {
        currentToken += char;
        isEscaped = false;
        continue;
      }

      if (char === '\\' && !inSingleQuote) {
        isEscaped = true;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
        if (currentToken.length > 0) {
          tokens.push(currentToken);
          currentToken = '';
        }
        continue;
      }

      currentToken += char;
    }

    if (currentToken.length > 0) {
      tokens.push(currentToken);
    }

    // 3. Parse flags and arguments
    let method = '';
    let rawUrl = '';
    const headers = {};
    const dataBodies = [];
    let insecure = false;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token === '-X' || token === '--request') {
        if (i + 1 < tokens.length) {
          method = tokens[++i].toUpperCase().replace(/^['"]|['"]$/g, '');
        }
      } else if (token.startsWith('-X')) {
        method = token.substring(2).toUpperCase().replace(/^['"]|['"]$/g, '');
      } else if (token === '-H' || token === '--header') {
        if (i + 1 < tokens.length) {
          const headerStr = tokens[++i].replace(/^['"]|['"]$/g, '');
          const colonIdx = headerStr.indexOf(':');
          if (colonIdx > -1) {
            const hKey = headerStr.substring(0, colonIdx).trim();
            const hVal = headerStr.substring(colonIdx + 1).trim();
            headers[hKey] = hVal;
          }
        }
      } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--json'].includes(token)) {
        if (i + 1 < tokens.length) {
          dataBodies.push(tokens[++i].replace(/^['"]|['"]$/g, ''));
        }
      } else if (token.startsWith('-d')) {
        dataBodies.push(token.substring(2).replace(/^['"]|['"]$/g, ''));
      } else if (token === '-k' || token === '--insecure') {
        insecure = true;
      } else if (token === '--url') {
        if (i + 1 < tokens.length) {
          rawUrl = tokens[++i].replace(/^['"]|['"]$/g, '');
        }
      } else if (token === '-u' || token === '--user') {
        if (i + 1 < tokens.length) {
          const userPass = tokens[++i].replace(/^['"]|['"]$/g, '');
          try {
            headers['Authorization'] = 'Basic ' + (typeof btoa === 'function' ? btoa(userPass) : Buffer.from(userPass).toString('base64'));
          } catch {
            headers['Authorization'] = 'Basic ' + userPass;
          }
        }
      } else if (!token.startsWith('-') && !rawUrl) {
        const unquoted = token.replace(/^['"]|['"]$/g, '');
        if (unquoted.startsWith('http://') || unquoted.startsWith('https://') || unquoted.includes('/') || unquoted.includes(':')) {
          rawUrl = unquoted;
        }
      }
    }

    if (!rawUrl) {
      return { success: false, error: 'URL endpoint tidak ditemukan dalam perintah cURL.' };
    }

    // 4. Default method
    if (!method) {
      method = dataBodies.length > 0 ? 'POST' : 'GET';
    }

    // 5. Auth extraction
    let authMode = 'none';
    let bearerToken = '';
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'authorization') {
        const match = v.match(/^Bearer\s+(.+)$/i);
        if (match) {
          authMode = 'static';
          bearerToken = match[1].trim();
        } else {
          authMode = 'static';
          bearerToken = v.trim();
        }
      }
    }

    // 6. Endpoint & Query parameters separation
    let baseUrl = rawUrl;
    const parameters = [];
    const testArgs = {};
    let queryParamCount = 0;
    let bodyParamCount = 0;

    try {
      let parsedUrl;
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        parsedUrl = new URL(rawUrl);
      } else {
        parsedUrl = new URL('https://' + rawUrl);
      }

      // decodeURI to keep {path_param} clean
      baseUrl = decodeURI(`${parsedUrl.origin}${parsedUrl.pathname}`);

      parsedUrl.searchParams.forEach((val, key) => {
        queryParamCount++;
        const isInteger = /^-?\d+$/.test(val);
        const isFloat = !isInteger && /^-?\d+(\.\d+)?$/.test(val);
        const isBoolean = val.toLowerCase() === 'true' || val.toLowerCase() === 'false';

        let pType = 'string';
        if (isInteger) pType = 'integer';
        else if (isFloat) pType = 'number';
        else if (isBoolean) pType = 'boolean';

        parameters.push({
          name: key,
          in: 'query',
          type: pType,
          description: `Query parameter ${key}`,
          required: true,
          default: val,
          include_empty: val === ''
        });

        testArgs[key] = val;
      });
    } catch {
      // Manual fallback if URL class fails
      const qIdx = rawUrl.indexOf('?');
      if (qIdx > -1) {
        baseUrl = rawUrl.substring(0, qIdx);
        const qs = rawUrl.substring(qIdx + 1);
        const pairs = qs.split('&');
        pairs.forEach(pair => {
          const [k, v = ''] = pair.split('=');
          if (k) {
            queryParamCount++;
            const decK = decodeURIComponent(k);
            const decV = decodeURIComponent(v);
            parameters.push({
              name: decK,
              in: 'query',
              type: 'string',
              description: `Query parameter ${decK}`,
              required: true,
              default: decV,
              include_empty: decV === ''
            });
            testArgs[decK] = decV;
          }
        });
      }
    }

    // 7. Path parameters ({param_name})
    const pathMatches = baseUrl.match(/\{([^}]+)\}/g);
    if (pathMatches) {
      pathMatches.forEach(pm => {
        const pName = pm.replace(/[{}]/g, '');
        if (!parameters.some(p => p.name === pName)) {
          parameters.push({
            name: pName,
            in: 'path',
            type: 'string',
            description: `Path variable ${pName}`,
            required: true,
            default: '',
            include_empty: false
          });
          testArgs[pName] = '';
        }
      });
    }

    // 8. Body parameters (JSON or form-urlencoded)
    const combinedBody = dataBodies.join('&');
    if (combinedBody) {
      let jsonParsed = false;
      try {
        const parsedJson = JSON.parse(combinedBody);
        if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
          jsonParsed = true;
          Object.entries(parsedJson).forEach(([key, val]) => {
            bodyParamCount++;
            let pType = typeof val;
            let defVal = val;
            let includeEmpty = false;

            if (val === null || val === undefined) {
              pType = 'string';
              defVal = '';
              includeEmpty = true;
            } else if (pType === 'number') {
              pType = Number.isInteger(val) ? 'integer' : 'number';
              defVal = String(val);
            } else if (pType === 'boolean') {
              defVal = String(val);
            } else if (pType === 'string') {
              includeEmpty = val === '';
            } else if (pType === 'object') {
              pType = 'string';
              defVal = JSON.stringify(val);
            }

            // Only add if not duplicate name
            if (!parameters.some(p => p.name === key)) {
              parameters.push({
                name: key,
                in: 'body',
                type: pType,
                description: `Body parameter ${key}`,
                required: true,
                default: defVal,
                include_empty: includeEmpty
              });
            }

            testArgs[key] = defVal;
          });
        }
      } catch {
        jsonParsed = false;
      }

      if (!jsonParsed && combinedBody.includes('=') && !combinedBody.startsWith('{')) {
        const pairs = combinedBody.split('&');
        pairs.forEach(pair => {
          const [k, v = ''] = pair.split('=');
          if (k) {
            bodyParamCount++;
            const decK = decodeURIComponent(k);
            const decV = decodeURIComponent(v);
            if (!parameters.some(p => p.name === decK)) {
              parameters.push({
                name: decK,
                in: 'body',
                type: 'string',
                description: `Body parameter ${decK}`,
                required: true,
                default: decV,
                include_empty: decV === ''
              });
            }
            testArgs[decK] = decV;
          }
        });
      }
    }

    // 9. Generate suggested human Source Name & snake_case Tool Identifier
    let suggestedName = '';
    let suggestedToolName = '';
    try {
      const uObj = new URL(baseUrl.startsWith('http') ? baseUrl : 'https://' + baseUrl);
      const pathParts = uObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        const cleanParts = pathParts
          .map(p => p.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9_-]/g, ''))
          .filter(p => p && !/^(v\d+|api)$/i.test(p));

        const targetPart = cleanParts.length > 0 ? cleanParts.slice(-2) : ['service'];
        const titleFormatted = targetPart
          .map(s => s.replace(/[_-]+/g, ' ').trim())
          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ');

        suggestedName = `${titleFormatted} API`;
        suggestedToolName = `api_${targetPart.join('_').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')}`;
      }
    } catch {
      suggestedName = 'API Service';
      suggestedToolName = 'api_service';
    }

    const summaryParts = [];
    if (queryParamCount > 0) summaryParts.push(`${queryParamCount} query`);
    if (bodyParamCount > 0) summaryParts.push(`${bodyParamCount} body`);
    if (pathMatches && pathMatches.length > 0) summaryParts.push(`${pathMatches.length} path`);

    const paramSummary = summaryParts.length > 0
      ? `(${summaryParts.join(', ')} parameter terdeteksi)`
      : '(tanpa parameter khusus)';

    return {
      success: true,
      endpoint: baseUrl,
      method,
      headers,
      authMode,
      bearerToken,
      verifySsl: !insecure,
      parameters,
      testArgs,
      bodyRaw: combinedBody,
      suggestedName: suggestedName || 'API Service',
      suggestedToolName: suggestedToolName || 'api_service',
      summary: `${method} ${baseUrl} ${paramSummary}`
    };
  } catch (err) {
    return {
      success: false,
      error: `Gagal mem-parsing cURL: ${err.message}`
    };
  }
}
