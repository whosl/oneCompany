import { getGateDefinition } from "@oc/shared";

export function getGatePresentation(gateType: string) {
  try {
    const definition = getGateDefinition(gateType);
    return {
      title: definition.title,
      description: definition.descriptionTemplate,
      allowsCustom: definition.allowsCustom,
    };
  } catch {
    return {
      title: gateType,
      description: "Human confirmation required.",
      allowsCustom: false,
    };
  }
}
