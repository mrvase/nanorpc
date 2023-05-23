const recursivelyModifyPrimitives = (
  obj: object,
  callback: (value: any) => any
): any => {
  if (typeof obj !== "object" || obj === null) {
    return callback(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((el) => recursivelyModifyPrimitives(el, callback));
  } else {
    let newObject: Record<string | number | symbol, any> = {};
    Object.entries(obj).forEach(([key, value]) => {
      newObject[key] = recursivelyModifyPrimitives(value, callback);
    });
    return newObject;
  }
};

export const modifyTypes = (object: object) => {
  return recursivelyModifyPrimitives(object, (value) => {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }

    const float = parseFloat(value);
    if (value === String(float)) {
      return float;
    }

    return value;
  });
};

export const getUnknownErrorMessage = (error: any) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};
