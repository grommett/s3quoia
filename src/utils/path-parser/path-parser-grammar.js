export const GRAMMAR = `
FilePattern
  = tokens:Token+ cache:CacheParam? {
      if (cache) return [...tokens, cache];
      return tokens;
    }

Token
  = LocationToken
  / DateToken
  / GlobToken
  / LiteralText

LocationToken
  = "{" _ "endpoint:" _ value:LocationValue _ "}" "/"? { return { type: "endpoint", value }; }
  / "{" _ "bucket:"   _ value:LocationValue _ "}" "/"? { return { type: "bucket",   value }; }

LocationValue
  = chars:[^} \t]+ { return chars.join(""); }

_ = [ \t]*

DateToken
  = "{yyyy}" { return { type: "date", unit: "year"   }; }
  / "{MM}"   { return { type: "date", unit: "month"  }; }
  / "{dd}"   { return { type: "date", unit: "day"    }; }
  / "{hh}"   { return { type: "date", unit: "hour"   }; }
  / "{mm}"   { return { type: "date", unit: "minute" }; }
  / "{ss}"   { return { type: "date", unit: "second" }; }

GlobToken
  = "*" { return { type: "glob" }; }

CacheParam
  = "?cache=" v:("true" / "false") { return { type: "cache", value: v === "true" }; }

LiteralText
  = chars:[^{*?]+ { return { type: "literal", value: chars.join("") }; }
`;
