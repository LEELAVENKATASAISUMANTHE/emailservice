const fieldRegistry = {
  students: {
    name: {
      label: "Name",
      width: 28,
      requiredFor: ["student", "placement", "other"],
      legacyKey: "name",
    },
    email: {
      label: "Email",
      width: 32,
      requiredFor: ["student", "placement", "other"],
      isEmail: true,
      legacyKey: "email",
    },
    department: {
      label: "Department",
      width: 22,
      requiredFor: ["student", "placement"],
      legacyKey: "department",
    },
  },
  classes: {
    className: {
      label: "Class",
      width: 18,
      requiredFor: ["student"],
      legacyKey: "class",
    },
  },
  placements: {
    company: {
      label: "Company",
      width: 28,
      requiredFor: [],
    },
    status: {
      label: "Status",
      width: 18,
      requiredFor: [],
    },
  },
};

const templatePresets = {
  student: {
    templateName: "Student Upload Template",
    uploadType: "student",
    fields: [
      { table: "students", field: "name" },
      { table: "students", field: "email" },
      { table: "classes", field: "className" },
      { table: "students", field: "department" },
    ],
  },
  placement: {
    templateName: "Placement Upload Template",
    uploadType: "placement",
    fields: [
      { table: "students", field: "name" },
      { table: "students", field: "email" },
      { table: "students", field: "department" },
      { table: "placements", field: "company" },
    ],
  },
  other: {
    templateName: "Generic Upload Template",
    uploadType: "other",
    fields: [
      { table: "students", field: "name" },
      { table: "students", field: "email" },
    ],
  },
};

export { fieldRegistry, templatePresets };
