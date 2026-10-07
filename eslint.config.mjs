import next from "eslint-config-next";

const config = [
  { ignores: ["src/generated/**", ".next/**", ".local/**", "node_modules/**", "apps/**", ".impeccable/**"] },
  ...next,
];

export default config;
